import { PanoramaPreview } from "../../renderer/components/PanoramaPreview";

const VisualConfigPage = () => {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-4 p-1">
        <div className="shrink-0 flex flex-col gap-1">
          <h2 className="text-2xl font-bold tracking-tight text-white">Visual Configurator</h2>
          <p className="text-xs text-white/50 max-w-xl">
            Experimental preview sandbox. The background uses a pre-captured panorama scene and the overlay
            will later show live module previews from the client.
          </p>
        </div>
        <div className="min-h-[520px] shrink-0">
          <PanoramaPreview />
        </div>
      </div>
    </div>
  );
};

export default VisualConfigPage;

