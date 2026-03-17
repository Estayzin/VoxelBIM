$base = 'https://unpkg.com/web-ifc@0.0.74/'
$dest = 'C:\Users\Usuario\Documents\GitHub\Revisor-IFC'
$files = @('web-ifc-api.js','web-ifc.wasm')
foreach ($f in $files) {
    $url = $base + $f
    $out = if ($f -like '*.wasm') { "$dest\wasm\$f" } else { "$dest\js\$f" }
    Write-Host "Descargando $f..."
    try {
        Invoke-WebRequest -Uri $url -OutFile $out -UseBasicParsing
        $size = (Get-Item $out).Length
        Write-Host "OK: $f ($size bytes)"
    } catch {
        Write-Host "ERROR: $_"
    }
}
Write-Host "DONE"
