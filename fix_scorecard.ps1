$f = "frontend\src\components\ScorecardDisplay.jsx"
$content = Get-Content $f -Raw

# 1. Replace hardcoded maxOvers * 6 with dynamic calculation
$content = $content -replace "\(match\.maxOvers \|\| 5\) \* 6", "(match.targetBalls > 0 ? match.targetBalls : (match.maxOvers || 5) * (match.ballsPerOver || 6))"

# 2. Replace remainingBalls subtraction: totalMatchBalls - match.totalBalls -> totalMatchBalls - (match.legalBallCount ?? match.totalBalls ?? 0)
$content = $content -replace "totalMatchBalls - match\.totalBalls", "totalMatchBalls - (match.legalBallCount ?? match.totalBalls ?? 0)"
$content = $content -replace "totalBalls - match\.totalBalls", "totalBalls - (match.legalBallCount ?? match.totalBalls ?? 0)"

# 3. Replace target info in KSP Theme line 706 where they hardcoded the subtraction again
$content = $content -replace "\(\(\(match\.maxOvers \|\| 5\) \* 6\) - match\.totalBalls\)", "((match.targetBalls > 0 ? match.targetBalls : (match.maxOvers || 5) * (match.ballsPerOver || 6)) - (match.legalBallCount ?? match.totalBalls ?? 0))"

Set-Content -Path $f -Value $content
Write-Host "ScorecardDisplay.jsx updated."
