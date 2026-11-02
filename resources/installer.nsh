; Removes what Alchemy registers so Windows lists it as a web browser (src/main/defaultbrowser.ts),
; including the entries from when it was called Ovyra.
!macro customUnInstall
  DeleteRegKey HKCU "Software\Classes\AlchemyHTML"
  DeleteRegKey HKCU "Software\Clients\StartMenuInternet\Alchemy"
  DeleteRegValue HKCU "Software\RegisteredApplications" "Alchemy"
  DeleteRegKey HKCU "Software\Classes\OvyraHTML"
  DeleteRegKey HKCU "Software\Clients\StartMenuInternet\Ovyra"
  DeleteRegValue HKCU "Software\RegisteredApplications" "Ovyra"
!macroend
