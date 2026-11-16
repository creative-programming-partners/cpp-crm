# Registra en el Programador de tareas de Windows el importador Hermes -> CRM de CPP.
# Corre al iniciar sesión y luego cada 10 minutos, en segundo plano (sin ventana).
# Para quitarlo: Unregister-ScheduledTask -TaskName "CPP CRM - Importador Hermes" -Confirm:$false
$ErrorActionPreference = "Stop"
$script = Join-Path $PSScriptRoot "importador_hermes.py"
$pythonw = (Get-Command pythonw.exe -ErrorAction SilentlyContinue | Where-Object { $_.Source -notlike "*WindowsApps*" } | Select-Object -First 1).Source
if (-not $pythonw) { $pythonw = Join-Path $env:LOCALAPPDATA "Programs\Python\Python314\pythonw.exe" }
if (-not (Test-Path $pythonw)) { throw "No encontré pythonw.exe. Instala Python o ajusta la ruta en este script." }

$action   = New-ScheduledTaskAction -Execute $pythonw -Argument "`"$script`"" -WorkingDirectory $PSScriptRoot
$alIniciar = New-ScheduledTaskTrigger -AtLogOn -User "$env:USERDOMAIN\$env:USERNAME"
$cada10   = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 10)
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable `
            -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 15)
Register-ScheduledTask -TaskName "CPP CRM - Importador Hermes" -Action $action -Trigger @($alIniciar, $cada10) -Settings $settings `
  -Description "Carga en el CRM de CPP los Excel nuevos del Prospector y del Vendedor de Hermes (Documents\CPP)." -Force | Out-Null
Write-Output "Tarea 'CPP CRM - Importador Hermes' registrada: al iniciar sesión y cada 10 minutos ($pythonw)."
