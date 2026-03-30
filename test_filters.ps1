$tests = @(
    'page=1&limit=2&sort=recorded_first',
    'page=1&limit=2&sort=recorded_first&recorded=yes',
    'page=1&limit=2&sort=recorded_first&recorded=no',
    'page=1&limit=2&sort=recorded_first&speaker=Mimi marbaniang',
    'page=1&limit=2&sort=id_asc',
    'page=1&limit=2&sort=id_desc'
)

foreach ($t in $tests) {
    try {
        $r = Invoke-RestMethod -Uri "http://localhost:3000/api/data?$t"
        Write-Host "[$t] => total=$($r.total), rows=$($r.rows.Count)"
    } catch {
        Write-Host "[$t] => ERROR: $($_.Exception.Message)"
    }
}
