# Mülakat Simülasyonu Projesi - WebGL Demo

Bu repo, yapay zeka destekli sanal mülakat simülasyonu projemizin WebGL demosunu içermektedir.

## Proje Hakkında

Bu proje, adayların mülakat becerilerini geliştirmelerine yardımcı olmak için tasarlanmış interaktif bir simülasyon uygulamasıdır. Unity ile geliştirilen 3D arayüz ve FastAPI backend'i kullanarak gerçekçi bir mülakat deneyimi sunar.

### Özellikler

- 3D sanal mülakatçı karakteri
- Gerçek zamanlı konuşma ve ses sentezi
- Dinamik mülakat soru akışı
- Metin tabanlı iletişim
- Mülakatçı karakterin konuşmalarını sesli olarak duyabilme
- Mülakat sonunda performans değerlendirmesi

## Demo

Bu WebGL demosu, tarayıcınızda projenin ön yüzünü deneyimlemenize olanak tanır. 
Demo'yu denemek için [buraya tıklayın](https://hirex3.github.io/Project/).

## Kullanım

1. Demo sayfasını açın
2. Sanal mülakatçı karakterimiz ile etkileşime geçin
3. Mikrofonunuzu kullanarak ya da metin girerek soruları yanıtlayın

## Teknik Detaylar

WebGL demo, aşağıdaki bileşenleri kullanmaktadır:

- Unity 2022.3 LTS
- WebGL 2.0
- Ready Player Me 3D avatar sistemi
- HTML5 ve JavaScript

## Backend API

API klasörü, FastAPI ile geliştirilmiş backend servisini içermektedir. Tam bir deneyim için API sunucusunu aşağıdaki komutla başlatabilirsiniz:

```bash
cd API
pip install -r requirements.txt
uvicorn interview_api:app --reload
```

---

© 2023 HireX3D Team | Tüm hakları saklıdır. 