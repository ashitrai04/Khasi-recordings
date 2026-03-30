try {
    $r = Invoke-WebRequest -Uri 'http://localhost:3000/api/data?page=1&limit=2&speaker=Mimi+marbaniang' -UseBasicParsing
    Write-Host "Status: $($r.StatusCode)"
    Write-Host $r.Content
} catch {
    Write-Host "Status: $($_.Exception.Response.StatusCode)"
    $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
    Write-Host $reader.ReadToEnd()
}
