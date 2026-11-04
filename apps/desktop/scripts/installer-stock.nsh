; Per-user NSIS without window-frame.dll. Used when VS C++ x86 tools are absent.
; Extraction falls back to nsExec + 7-Zip in installer-directories.nsh.
!include "LogicLib.nsh"
!include "FileFunc.nsh"
!define /ifndef INSTALLER_BUILD_DIR "${__FILEDIR__}\..\.desktop-build\targets\win-x64\installer-ui"

!macro customHeader
  !define /ifndef INSTALLER_STRINGS_FILE "${INSTALLER_BUILD_DIR}\strings.nsh"
  !include "${INSTALLER_STRINGS_FILE}"
!macroend

!macro customInit
  ${If} ${isForAllUsers}
    MessageBox MB_OK|MB_ICONEXCLAMATION "$(INSTALLER_PER_USER)" /SD IDOK
    SetErrorLevel 2
    Quit
  ${EndIf}
  ReadRegStr $0 HKLM "${INSTALL_REGISTRY_KEY}" InstallLocation
  ${If} $0 != ""
    MessageBox MB_OK|MB_ICONEXCLAMATION "$(INSTALLER_PER_USER)" /SD IDOK
    SetErrorLevel 2
    Quit
  ${EndIf}
  !insertmacro setInstallModePerUser
  StrCpy $hasPerMachineInstallation 0
  StrCpy $hasPerUserInstallation 1
!macroend

!macro customInstallMode
  StrCpy $installMode CurrentUser
  SetShellVarContext current
  Abort
!macroend

!ifndef BUILD_UNINSTALLER
  !include "${__FILEDIR__}\installer-directories.nsh"
!endif

!macro customInstall
  Push $0
  StrCpy $0 0
  ${If} ${Errors}
    StrCpy $0 1
  ${EndIf}
  !insertmacro dshFinishDirectories
  WriteRegStr SHELL_CONTEXT "${UNINSTALL_REGISTRY_KEY}" InstallLocation "$INSTDIR"
  ${If} $0 == 1
    SetErrors
  ${Else}
    ClearErrors
  ${EndIf}
  Pop $0
!macroend
