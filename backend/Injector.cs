using System;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Runtime.Versioning;
using System.Text;
using System.IO;

namespace Launcher
{
    public class Injector
    {
        #region Win32 API Imports

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern IntPtr OpenProcess(
            ProcessAccessFlags processAccess,
            bool bInheritHandle,
            int processId);

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern IntPtr VirtualAllocEx(
            IntPtr hProcess,
            IntPtr lpAddress,
            uint dwSize,
            AllocationType flAllocationType,
            MemoryProtection flProtect);

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern bool WriteProcessMemory(
            IntPtr hProcess,
            IntPtr lpBaseAddress,
            byte[] lpBuffer,
            uint nSize,
            out IntPtr lpNumberOfBytesWritten);

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern IntPtr CreateRemoteThread(
            IntPtr hProcess,
            IntPtr lpThreadAttributes,
            uint dwStackSize,
            IntPtr lpStartAddress,
            IntPtr lpParameter,
            uint dwCreationFlags,
            out IntPtr lpThreadId);

        // NtCreateThreadEx - often works when CreateRemoteThread is blocked or does nothing on Win10/11
        [DllImport("ntdll.dll", SetLastError = true)]
        private static extern int NtCreateThreadEx(
            out IntPtr threadHandle,
            uint desiredAccess,
            IntPtr objectAttributes,
            IntPtr processHandle,
            IntPtr startAddress,
            IntPtr parameter,
            byte createSuspended,  // BOOLEAN: 0 = run immediately
            UIntPtr zeroBits,
            UIntPtr stackSize,
            UIntPtr maximumStackSize,
            IntPtr attributeList);

        private const uint THREAD_ALL_ACCESS = 0x1F03FF;

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern IntPtr LoadLibraryEx(
            string lpFileName,
            IntPtr hReservedNull,
            uint dwFlags);

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern bool FreeLibrary(IntPtr hModule);

        private const uint DONT_RESOLVE_DLL_REFERENCES = 0x00000001;

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern IntPtr GetProcAddress(
            IntPtr hModule,
            string procName);

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern IntPtr GetModuleHandle(
            string lpModuleName);

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern bool CloseHandle(IntPtr hObject);

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern uint WaitForSingleObject(
            IntPtr hHandle,
            uint dwMilliseconds);

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern bool GetExitCodeThread(
            IntPtr hThread,
            out uint lpExitCode);

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern bool VirtualFreeEx(
            IntPtr hProcess,
            IntPtr lpAddress,
            UIntPtr dwSize,
            uint dwFreeType);

        private const uint MEM_RELEASE = 0x8000;

        [Flags]
        private enum ProcessAccessFlags : uint
        {
            All = 0x001F0FFF,
            Terminate = 0x00000001,
            CreateThread = 0x00000002,
            VirtualMemoryOperation = 0x00000008,
            VirtualMemoryRead = 0x00000010,
            VirtualMemoryWrite = 0x00000020,
            DuplicateHandle = 0x00000040,
            CreateProcess = 0x000000080,
            SetQuota = 0x00000100,
            SetInformation = 0x00000200,
            QueryInformation = 0x00000400,
            QueryLimitedInformation = 0x00001000,
            Synchronize = 0x00100000
        }

        [Flags]
        private enum AllocationType
        {
            Commit = 0x1000,
            Reserve = 0x2000,
            Decommit = 0x4000,
            Release = 0x8000,
            Reset = 0x80000,
            Physical = 0x400000,
            TopDown = 0x100000,
            WriteWatch = 0x200000,
            LargePages = 0x20000000
        }

        [Flags]
        private enum MemoryProtection
        {
            Execute = 0x10,
            ExecuteRead = 0x20,
            ExecuteReadWrite = 0x40,
            ExecuteWriteCopy = 0x80,
            NoAccess = 0x01,
            ReadOnly = 0x02,
            ReadWrite = 0x04,
            WriteCopy = 0x08,
            GuardModifierflag = 0x100,
            NoCacheModifierflag = 0x200,
            WriteCombineModifierflag = 0x400
        }

        #endregion

        /// <summary>
        /// Gets all running javaw.exe processes
        /// </summary>
        public static Process[] GetJavawProcesses()
        {
            try
            {
                return Process.GetProcessesByName("javaw");
            }
            catch (Exception ex)
            {
                throw new Exception($"Failed to get javaw processes: {ex.Message}");
            }
        }

        /// <summary>
        /// Injects a DLL byte array directly into the target process using Manual Mapping.
        /// This completely bypasses LoadLibrary and the file system, making the DLL invisible to standard tools.
        /// </summary>
        /// <param name="processId">Target process ID</param>
        /// <param name="dllBytes">Raw DLL file bytes</param>
        /// <returns>True if injection succeeded</returns>
        public static bool InjectDLLFromMemory(int processId, byte[] dllBytes)
        {
            try
            {
                using (var injector = new Bleak.Injector(processId, dllBytes, Bleak.InjectionMethod.ManualMap))
                {
                    injector.InjectDll();
                }
                return true;
            }
            catch (Exception ex)
            {
                throw new Exception($"Manual Map Injection failed: {ex.Message}", ex);
            }
        }

        /// <summary>
        /// Injects a DLL into the target process
        /// </summary>
        /// <param name="processId">Target process ID</param>
        /// <param name="dllPath">Full path to the DLL file</param>
        /// <returns>True if injection succeeded, false otherwise</returns>
        public static bool InjectDLL(int processId, string dllPath, string bearerToken = "")
        {
            // Validate DLL path
            if (!File.Exists(dllPath))
            {
                throw new FileNotFoundException("DLL file not found", dllPath);
            }

            // Validate DLL extension
            if (!dllPath.EndsWith(".dll", StringComparison.OrdinalIgnoreCase))
            {
                throw new ArgumentException("File must be a DLL", nameof(dllPath));
            }

            // Always use full absolute path so the target process can resolve it
            dllPath = Path.GetFullPath(dllPath);

            IntPtr hProcess = IntPtr.Zero;
            IntPtr allocMemAddress = IntPtr.Zero;
            IntPtr hThread = IntPtr.Zero;

            try
            {
                // Open the target process with full access so NtCreateThreadEx/CreateRemoteThread can run
                hProcess = OpenProcess(
                    ProcessAccessFlags.All,
                    false,
                    processId);

                if (hProcess == IntPtr.Zero)
                {
                    int err = Marshal.GetLastWin32Error();
                    if (err == 5) // ERROR_ACCESS_DENIED
                        throw new Exception("Access denied. Run the launcher (and backend) as Administrator (right-click → Run as administrator).");
                    throw new Exception($"Failed to open process. Error code: {err}");
                }



                // Get the address of LoadLibraryW (Unicode) - same as your working C++ code
                IntPtr loadLibraryAddr = GetProcAddress(GetModuleHandle("kernel32.dll"), "LoadLibraryW");
                if (loadLibraryAddr == IntPtr.Zero)
                {
                    throw new Exception("Failed to get LoadLibraryW address");
                }

                // Encode DLL path as UTF-16 (wide string) with null terminator - like C++ wstring
                byte[] dllBytes = Encoding.Unicode.GetBytes(dllPath + "\0");
                uint pathSize = (uint)dllBytes.Length;

                // Allocate memory in the target process for the wide string
                allocMemAddress = VirtualAllocEx(
                    hProcess,
                    IntPtr.Zero,
                    pathSize,
                    AllocationType.Commit | AllocationType.Reserve,
                    MemoryProtection.ReadWrite);

                if (allocMemAddress == IntPtr.Zero)
                {
                    throw new Exception($"Failed to allocate memory. Error code: {Marshal.GetLastWin32Error()}");
                }

                // Write the DLL path (UTF-16) to the allocated memory
                IntPtr bytesWritten;
                bool writeResult = WriteProcessMemory(
                    hProcess,
                    allocMemAddress,
                    dllBytes,
                    pathSize,
                    out bytesWritten);

                if (!writeResult)
                {
                    throw new Exception($"Failed to write to process memory. Error code: {Marshal.GetLastWin32Error()}");
                }

                // Try NtCreateThreadEx first (more reliable on Windows 10/11 when CreateRemoteThread "succeeds but does nothing")
                int ntStatus = NtCreateThreadEx(
                    out hThread,
                    THREAD_ALL_ACCESS,
                    IntPtr.Zero,
                    hProcess,
                    loadLibraryAddr,
                    allocMemAddress,
                    0,  // createSuspended = 0 -> run immediately
                    UIntPtr.Zero, UIntPtr.Zero, UIntPtr.Zero,
                    IntPtr.Zero);

                if (ntStatus != 0 || hThread == IntPtr.Zero)
                {
                    // Fallback to CreateRemoteThread
                    IntPtr threadId;
                    hThread = CreateRemoteThread(
                        hProcess,
                        IntPtr.Zero,
                        0,
                        loadLibraryAddr,
                        allocMemAddress,
                        0,
                        out threadId);

                    if (hThread == IntPtr.Zero)
                    {
                        int err = Marshal.GetLastWin32Error();
                        if (err == 5)
                            throw new Exception("Access denied. Run the launcher AND backend as Administrator (right-click → Run as administrator).");
                        throw new Exception($"CreateRemoteThread failed. Error code: {err}");
                    }
                }

                // Wait for the thread to finish (timeout: 10 seconds - DLL init can take time)
                uint waitResult = WaitForSingleObject(hThread, 10000);
                if (waitResult != 0) // 0 = WAIT_OBJECT_0 (success)
                {
                    throw new Exception("Remote thread did not complete in time (timeout 10s)");
                }

                // LoadLibraryW return value is the thread exit code: 0 = failed, non-zero = HMODULE
                if (!GetExitCodeThread(hThread, out uint exitCode))
                {
                    throw new Exception($"GetExitCodeThread failed. Error: {Marshal.GetLastWin32Error()}");
                }
                if (exitCode == 0)
                {
                    throw new Exception(
                        "LoadLibraryW returned NULL - the DLL could not be loaded. " +
                        "Ensure the DLL is 64-bit (x64), and that dependencies (e.g. MinHook.x64.dll) are in the same folder as the DLL. " +
                        "Path: " + dllPath);
                }

                // --- JWT PASS-THROUGH VIA EXPORT ---
                if (!string.IsNullOrEmpty(bearerToken))
                {
                    // 1. Allocate second memory block containing token
                    byte[] tokenBytes = Encoding.UTF8.GetBytes(bearerToken + "\0");
                    IntPtr tokenMem = VirtualAllocEx(
                        hProcess,
                        IntPtr.Zero,
                        (uint)tokenBytes.Length,
                        AllocationType.Commit | AllocationType.Reserve,
                        MemoryProtection.ReadWrite);

                    if (tokenMem == IntPtr.Zero)
                        throw new Exception($"Failed to allocate memory for token parameter. Error: {Marshal.GetLastWin32Error()}");
                    
                    WriteProcessMemory(hProcess, tokenMem, tokenBytes, (uint)tokenBytes.Length, out _);

                    // 2. Load DLL locally to calculate RVA
                    IntPtr localHModule = LoadLibraryEx(dllPath, IntPtr.Zero, DONT_RESOLVE_DLL_REFERENCES);
                    if (localHModule == IntPtr.Zero)
                        throw new Exception($"Failed to load DLL locally for RVA calculation. Error: {Marshal.GetLastWin32Error()}");

                    IntPtr localExportAddr = GetProcAddress(localHModule, "StartInjectionWithToken");
                    if (localExportAddr == IntPtr.Zero)
                    {
                        FreeLibrary(localHModule);
                        throw new Exception("StartInjectionWithToken export not found in the injected DLL.");
                    }

                    long rva = localExportAddr.ToInt64() - localHModule.ToInt64();
                    FreeLibrary(localHModule);

                    IntPtr remoteHModule = (IntPtr)exitCode;
                    IntPtr remoteFuncAddr = (IntPtr)(remoteHModule.ToInt64() + rva);

                    Console.WriteLine($"[INJECT] RVA calculated: 0x{rva:X}. Remote func addr: 0x{remoteFuncAddr.ToInt64():X}");

                    // 3. Spawns second thread
                    IntPtr hThreadToken = IntPtr.Zero;
                    int ntStatusToken = NtCreateThreadEx(
                        out hThreadToken,
                        THREAD_ALL_ACCESS,
                        IntPtr.Zero,
                        hProcess,
                        remoteFuncAddr,
                        tokenMem,
                        0,
                        UIntPtr.Zero, UIntPtr.Zero, UIntPtr.Zero,
                        IntPtr.Zero);

                    if (ntStatusToken != 0 || hThreadToken == IntPtr.Zero)
                    {
                        hThreadToken = CreateRemoteThread(
                            hProcess,
                            IntPtr.Zero,
                            0,
                            remoteFuncAddr,
                            tokenMem,
                            0,
                            out _);

                        if (hThreadToken == IntPtr.Zero)
                            throw new Exception($"Failed to launch second remote thread. Error: {Marshal.GetLastWin32Error()}");
                    }

                    // 4. Wait & Free
                    WaitForSingleObject(hThreadToken, 10000);
                    VirtualFreeEx(hProcess, tokenMem, UIntPtr.Zero, MEM_RELEASE);
                    CloseHandle(hThreadToken);
                }
                // -----------------------------------

                return true;
            }
            catch (Exception)
            {
                throw;
            }
            finally
            {
                // Free remote memory (path string) - same as C++ cleanup
                if (allocMemAddress != IntPtr.Zero && hProcess != IntPtr.Zero)
                {
                    VirtualFreeEx(hProcess, allocMemAddress, UIntPtr.Zero, MEM_RELEASE);
                }
                if (hThread != IntPtr.Zero)
                    CloseHandle(hThread);
                if (hProcess != IntPtr.Zero)
                    CloseHandle(hProcess);
            }
        }

        /// <summary>
        /// Validates if the current process has sufficient privileges (Windows only)
        /// </summary>
        [SupportedOSPlatform("windows")]
        public static bool HasAdminPrivileges()
        {
            try
            {
                var identity = System.Security.Principal.WindowsIdentity.GetCurrent();
                var principal = new System.Security.Principal.WindowsPrincipal(identity);
                return principal.IsInRole(System.Security.Principal.WindowsBuiltInRole.Administrator);
            }
            catch
            {
                return false;
            }
        }
    }
}
