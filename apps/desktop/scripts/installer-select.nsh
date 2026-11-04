; Pick branded NSIS chrome when window-frame.dll was compiled; otherwise stock per-user UI.
!define /ifndef INSTALLER_BUILD_DIR "${__FILEDIR__}\..\.desktop-build\targets\win-x64\installer-ui"
!if /FileExists "${INSTALLER_BUILD_DIR}\window-frame.dll"
  !include "${__FILEDIR__}\installer.nsh"
!else
  !include "${__FILEDIR__}\installer-stock.nsh"
!endif
