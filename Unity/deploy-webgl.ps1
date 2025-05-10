# GitHub Pages için WebGL Dağıtım Betiği
# Bu betik, Unity WebGL derlemenizi GitHub Pages'e yükleme sürecini otomatikleştirir

# Parametreler
param (
    [string]$buildPath = "./WebGLBuild", # WebGL derleme klasörünün yolu
    [string]$deployBranch = "gh-pages",  # Dağıtım yapılacak branch
    [switch]$pushToGitHub = $false       # GitHub'a otomatik push yapılıp yapılmayacağı
)

# Git'in yüklü olup olmadığını kontrol et
try {
    git --version > $null
    Write-Host "Git yüklü. İşleme devam ediliyor..." -ForegroundColor Green
}
catch {
    Write-Host "Git yüklü değil veya PATH'te bulunamıyor. Lütfen devam etmek için Git'i yükleyin." -ForegroundColor Red
    exit 1
}

# Belirtilen yolun var olup olmadığını kontrol eden fonksiyon
function Test-PathExists {
    param (
        [string]$Path
    )
    
    if (-not (Test-Path $Path)) {
        Write-Host "Hata: '$Path' yolu mevcut değil." -ForegroundColor Red
        Write-Host "Lütfen önce Unity WebGL projenizi derleyin ve buildPath parametresini güncelleyin." -ForegroundColor Yellow
        exit 1
    }
}

# WebGL derleme yolunun var olup olmadığını kontrol et
Test-PathExists $buildPath

# Mevcut branch adını al
$currentBranch = git rev-parse --abbrev-ref HEAD
Write-Host "Mevcut branch: $currentBranch" -ForegroundColor Cyan

# Dağıtım branch'inin var olup olmadığını kontrol et
$branchExists = git show-ref --verify --quiet refs/heads/$deployBranch
if ($?) {
    Write-Host "Dağıtım branch'i '$deployBranch' mevcut." -ForegroundColor Green
}
else {
    Write-Host "Dağıtım branch'i '$deployBranch' mevcut değil. Oluşturuluyor..." -ForegroundColor Yellow
    git checkout --orphan $deployBranch
    git rm -rf .
    git commit --allow-empty -m "$deployBranch branch'i başlatıldı"
    git checkout $currentBranch
}

# Derleme için geçici bir dizin oluştur
$tempDir = "temp-deploy"
if (Test-Path $tempDir) {
    Remove-Item -Recurse -Force $tempDir
}
New-Item -ItemType Directory -Path $tempDir > $null

# WebGL derlemesini geçici dizine kopyala
Write-Host "WebGL derleme dosyaları geçici dizine kopyalanıyor..." -ForegroundColor Cyan
Copy-Item -Path "$buildPath/*" -Destination $tempDir -Recurse

# index.html dosyası yoksa oluştur (Unity yükleyicisine yönlendirme yapar)
if (-not (Test-Path "$tempDir/index.html")) {
    $unityLoaderFile = Get-ChildItem -Path $tempDir -Filter "*.html" | Select-Object -First 1
    if ($unityLoaderFile) {
        $redirectHtml = @"
<!DOCTYPE html>
<html>
<head>
    <meta http-equiv="refresh" content="0; url=./$($unityLoaderFile.Name)" />
    <title>Unity WebGL Oynatıcıya Yönlendiriliyor</title>
</head>
<body>
    <p>Otomatik olarak yönlendirilmezseniz, <a href="./$($unityLoaderFile.Name)">Unity WebGL oynatıcıya gitmek için buraya tıklayın</a>.</p>
</body>
</html>
"@
        Set-Content -Path "$tempDir/index.html" -Value $redirectHtml
        Write-Host "$($unityLoaderFile.Name) dosyasına yönlendiren index.html oluşturuldu" -ForegroundColor Green
    } else {
        Write-Host "Uyarı: Derlemede bir Unity yükleyici HTML dosyası bulunamadı." -ForegroundColor Yellow
    }
}

# Dağıtım branch'ine geç
git checkout $deployBranch

# Mevcut dosyaları temizle (.git ve geçici dizin hariç)
Get-ChildItem -Path . -Exclude ".git", $tempDir | Remove-Item -Recurse -Force

# Geçici dizinden dosyaları kopyala
Copy-Item -Path "$tempDir/*" -Destination . -Recurse

# Tüm dosyaları git'e ekle
git add -A
git status

Write-Host "`nWebGL derleme GitHub Pages dağıtımı için hazırlandı." -ForegroundColor Green
Write-Host "Dosyalar '$deployBranch' branch'inde hazırlandı." -ForegroundColor Cyan

if ($pushToGitHub) {
    $commitMessage = "WebGL derleme $(Get-Date -Format 'yyyy-MM-dd HH:mm') tarihinde güncellendi"
    git commit -m $commitMessage
    git push origin $deployBranch

    Write-Host "`nWebGL derleme GitHub Pages'e gönderildi." -ForegroundColor Green
    Write-Host "Siteniz şu adreste erişilebilir olacak: https://kullaniciadi.github.io/repo-adi/" -ForegroundColor Cyan
} else {
    Write-Host "`nDağıtımı tamamlamak için şu komutları çalıştırın:" -ForegroundColor Yellow
    Write-Host "git commit -m 'WebGL derleme güncellendi'" -ForegroundColor White
    Write-Host "git push origin $deployBranch" -ForegroundColor White
    Write-Host "`nArdından, GitHub repository ayarlarınızdan GitHub Pages bölümüne giderek, kaynak olarak '$deployBranch' branch'ini seçin." -ForegroundColor Yellow
}

# Orijinal branch'e geri dön
git checkout $currentBranch

# Geçici dizini temizle
Remove-Item -Recurse -Force $tempDir

Write-Host "`nDağıtım hazırlığı tamamlandı!" -ForegroundColor Green 