!macro customInit
  SetDetailsView show
  
  ; Force delete old corrupted files before installing
  RMDir /r "$INSTDIR\resources\app"
  RMDir /r "$INSTDIR\resources\app.asar.unpacked"
  Delete "$INSTDIR\resources\app.asar"
!macroend
