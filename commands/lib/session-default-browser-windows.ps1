$ErrorActionPreference = 'Stop'
$choice = $null
$commandKey = $null
try {
  $choice = [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey('Software\Microsoft\Windows\Shell\Associations\UrlAssociations\http\UserChoice')
  $program = if ($null -ne $choice) { [string]$choice.GetValue('ProgId') } else { '' }
  if ($program.Length -gt 200 -or $program -notmatch '^[A-Za-z0-9_.-]+$') { throw 'No default HTTP browser.' }
  $commandKey = [Microsoft.Win32.Registry]::ClassesRoot.OpenSubKey($program + '\shell\open\command')
  if ($null -eq $commandKey) { throw 'Unsupported browser registration.' }
  $command = [string]$commandKey.GetValue('')
  $match = [regex]::Match($command, '^\s*"([^"]+\.exe)"(?:\s|$)', 'IgnoreCase')
  if (-not $match.Success) { $match = [regex]::Match($command, '^\s*([^"\r\n]+?\.exe)(?:\s|$)', 'IgnoreCase') }
  if (-not $match.Success) { throw 'Unsupported browser registration.' }
  $executable = [Environment]::ExpandEnvironmentVariables($match.Groups[1].Value)
  if (-not [IO.Path]::IsPathRooted($executable) -or -not [IO.File]::Exists($executable)) { throw 'Browser unavailable.' }
  # Read the registered executable only. Never evaluate the registry command.
  [Console]::Write((@{ executable = $executable } | ConvertTo-Json -Compress))
} catch {
  [Console]::Error.Write('Default HTTP browser registration unavailable.')
  exit 2
} finally {
  if ($null -ne $commandKey) { $commandKey.Dispose() }
  if ($null -ne $choice) { $choice.Dispose() }
}
