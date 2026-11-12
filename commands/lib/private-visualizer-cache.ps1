param([Parameter(Mandatory = $true)][string]$Directory)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# The caller supplies only its validated, project-local visualizer directory.
# Reject reparse points again before changing this one directory's DACL.
$target = [System.IO.Path]::GetFullPath($Directory)
$cursor = if (Test-Path -LiteralPath $target) { $target } else { [System.IO.Directory]::GetParent($target).FullName }
while ($cursor) {
    $item = Get-Item -LiteralPath $cursor -Force
    if (-not $item.PSIsContainer -or ($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint)) { throw 'Invalid private cache directory.' }
    $parent = [System.IO.Directory]::GetParent($cursor)
    if ($null -eq $parent) { break }
    $cursor = $parent.FullName
}
$owner = [System.Security.Principal.WindowsIdentity]::GetCurrent().User
$allowed = @($owner.Value, 'S-1-5-18', 'S-1-5-32-544') | Select-Object -Unique
$inherit = [System.Security.AccessControl.InheritanceFlags]'ContainerInherit,ObjectInherit'
function Test-PrivateAcl($Acl) {
    if (-not $Acl.AreAccessRulesProtected -or $Acl.Access.Count -ne $allowed.Count) { return $false }
    foreach ($rule in $Acl.Access) {
        $sid = $rule.IdentityReference.Translate([System.Security.Principal.SecurityIdentifier]).Value
        if ($sid -notin $allowed -or $rule.IsInherited -or $rule.AccessControlType -ne 'Allow' -or $rule.FileSystemRights -ne 'FullControl' -or $rule.InheritanceFlags -ne $inherit -or $rule.PropagationFlags -ne 'None') { return $false }
    }
    return $true
}
if (-not (Test-Path -LiteralPath $target) -or -not (Test-PrivateAcl (Get-Acl -LiteralPath $target))) {
    $private = New-Object System.Security.AccessControl.DirectorySecurity
    $private.SetAccessRuleProtection($true, $false)
    foreach ($sid in $allowed) {
        $identity = New-Object System.Security.Principal.SecurityIdentifier($sid)
        $rule = New-Object System.Security.AccessControl.FileSystemAccessRule($identity, 'FullControl', $inherit, 'None', 'Allow')
        $private.AddAccessRule($rule)
    }
    if (Test-Path -LiteralPath $target) { [System.IO.Directory]::SetAccessControl($target, $private) }
    else { [void][System.IO.Directory]::CreateDirectory($target, $private) }
}
if (-not (Test-PrivateAcl (Get-Acl -LiteralPath $target))) { throw 'Private cache permissions could not be verified.' }
