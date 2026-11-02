; Removes what Ovyra registers so Windows lists it as a web browser (src/main/defaultbrowser.ts).
!macro customUnInstall
  DeleteRegKey HKCU "Software\Classes\OvyraHTML"
  DeleteRegKey HKCU "Software\Clients\StartMenuInternet\Ovyra"
  DeleteRegValue HKCU "Software\RegisteredApplications" "Ovyra"
!macroend
