# HireX3D - Mülakat Simülasyonu Projesi

Bu repo, yapay zeka destekli sanal mülakat simülasyonu projemizin hem masaüstü hem de web versiyonlarını içermektedir.

## 🚀 Proje Hakkında

HireX3D, adayların mülakat becerilerini geliştirmelerine yardımcı olmak için tasarlanmış interaktif bir simülasyon uygulamasıdır. Unity ile geliştirilen 3D arayüz ve FastAPI backend'i kullanarak gerçekçi bir mülakat deneyimi sunar. Uygulamamız Gemini ve ElevenLabs API'lerini kullanarak doğal dil işleme ve gerçekçi ses sentezi sağlar.

### ✨ Özellikler

- 3D sanal mülakatçı karakteri
- Gerçek zamanlı konuşma ve ses sentezi
- Dinamik mülakat soru akışı
- Metin tabanlı iletişim
- Mülakatçı karakterin konuşmalarını sesli olarak duyabilme
- Mülakat sonunda performans değerlendirmesi

## 🖥️ Kurulum

### Ön Gereksinimler

- Python 3.8+
- Sanal ortam (venv veya conda)
- API anahtarları:
  - Google Gemini API
  - ElevenLabs API

### Kurulum Adımları

1. Repoyu klonlayın ve proje dizinine girin:
   ```bash
   git clone https://github.com/HireX3/Project.git
   cd Project
   ```

2. Sanal ortam oluşturun ve aktifleştirin:
   ```bash
   # Windows
   python -m venv venv
   .\venv\Scripts\activate

   # Linux/macOS
   python -m venv venv
   source venv/bin/activate
   ```

3. Gereken paketleri yükleyin:
   ```bash
   pip install -r requirements.txt
   ```

4. `.env` dosyası oluşturun ve API anahtarlarınızı ekleyin:
   ```
   GEMINI_API_KEY=your_gemini_api_key_here
   ELEVENLABS_API_KEY=your_elevenlabs_api_key_here
   ```

## 🚀 Kullanım

### Backend API'yi Çalıştırma

1. Sanal ortamınızın aktif olduğundan emin olun
2. API'yi başlatın:
   ```bash
   cd API
   uvicorn api:app --reload --host 0.0.0.0 --port 8001
   ```
3. API, http://localhost:8001 adresinde çalışacaktır

### Masaüstü Uygulamasını Çalıştırma

1. `DesktopBuild` klasöründeki `Hirex3D.exe` dosyasını çalıştırın
2. Uygulama açıldığında, bağlantı ayarlarını kontrol edin (API'nin çalıştığı adres)
3. Sanal mülakatçı ile görüşmeye başlayın

### WebGL Demo

WebGL demosu, tarayıcınızda projenin ön yüzünü deneyimlemenize olanak tanır. 
Demo'yu denemek için [buraya tıklayın](https://hirex3.github.io/Project/).

## 🛠️ Proje Yapısı

```
Project/
│
├── API/                    # Backend API kodu
│   └── api.py              # FastAPI uygulaması
│
├── DesktopBuild/           # Unity masaüstü build dosyaları
│   ├── Hirex3D.exe         # Windows çalıştırılabilir dosyası
│   ├── Hirex3D_Data/       # Uygulama verileri
│   └── ...
│
├── Unity/                  # Unity projesi kaynak dosyaları
│   ├── Assets/             # Unity asset dosyaları
│   ├── Packages/           # Unity paketleri
│   └── ...
│
├── .env                    # Çevre değişkenleri (API anahtarları)
├── .gitignore              # Git tarafından yok sayılacak dosyalar
└── requirements.txt        # Python bağımlılıkları
```

## 🔑 API Anahtarları

Uygulama iki API anahtarı gerektirir:

1. **Gemini API Key**: Google AI Studio'dan ücretsiz olarak alınabilir. [Google AI Studio](https://makersuite.google.com/app/apikey)
2. **ElevenLabs API Key**: ElevenLabs hesabınızın ayarlar bölümünden alınabilir. [ElevenLabs](https://elevenlabs.io/app/account)

Bu anahtarları `.env` dosyasına aşağıdaki formatta ekleyin:
```
GEMINI_API_KEY=your_gemini_api_key_here
ELEVENLABS_API_KEY=your_elevenlabs_api_key_here
```

## 🤝 Katkıda Bulunma

Projeye katkıda bulunmak isterseniz:

1. Bu repoyu fork edin
2. Yeni bir branch oluşturun: `git checkout -b feature/your-feature-name`
3. Değişikliklerinizi commit edin: `git commit -m 'Add some feature'`
4. Branch'inizi push edin: `git push origin feature/your-feature-name`
5. Pull request açın

## 📝 Lisans

Bu proje [MIT Lisansı](LICENSE) altında lisanslanmıştır.

## 📬 İletişim

Sorularınız veya önerileriniz için GitHub üzerinden iletişime geçebilirsiniz.

---

© 2023 HireX3D Team | Tüm hakları saklıdır. 