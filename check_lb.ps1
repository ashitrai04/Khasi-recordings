$r = Invoke-RestMethod -Uri 'http://localhost:3000/api/leaderboard?period=all'
$sum = 0
foreach ($x in $r.leaderboard) {
    $sum += $x.count
    Write-Host "$($x.name): $($x.count)  (running: $sum)"
}
Write-Host ""
Write-Host "SUM of per-speaker counts: $sum"
Write-Host "API total_recordings:      $($r.total_recordings)"
Write-Host "Difference:                $($r.total_recordings - $sum)"
