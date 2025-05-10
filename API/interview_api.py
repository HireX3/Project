from fastapi import FastAPI, HTTPException, Depends, Body, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
import uvicorn
import os
import requests
import json
from typing import List, Dict, Optional, Any
from enum import Enum
from dotenv import load_dotenv
import uuid
import base64
from gtts import gTTS
import io

# .env dosyasını yükle
load_dotenv()

# Gemini API anahtarını al
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
if not GEMINI_API_KEY:
    raise ValueError("GEMINI_API_KEY bulunamadı. Lütfen .env dosyasını kontrol edin.")

app = FastAPI(title="Mülakat Simülasyonu API")

# CORS middleware ayarları
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Statik dosyaları servis etmek için bir dizin oluştur
os.makedirs("static/interviews", exist_ok=True)

# Mülakat durumlarını saklamak için bellek içi depolama
interview_sessions = {}

# WebSocket bağlantılarını saklamak için
active_connections: Dict[str, WebSocket] = {}

def text_to_speech(text: str) -> bytes:
    """Metni sese dönüştürür"""
    try:
        print(f"Seslendirilecek metin: {text}")
        # gTTS ile ses oluştur
        tts = gTTS(text=text, lang='tr', slow=False)
        
        # Ses verisini bir bellek tamponuna kaydet
        mp3_fp = io.BytesIO()
        tts.write_to_fp(mp3_fp)
        mp3_fp.seek(0)
        
        audio_data = mp3_fp.read()
        print(f"Ses verisi oluşturuldu, boyut: {len(audio_data)} bytes")
        return audio_data
    except Exception as e:
        print(f"Ses dönüştürme hatası: {str(e)}")
        return None

async def send_audio_to_unity(websocket: WebSocket, text: str):
    """Metni sese dönüştürüp Unity'ye gönderir"""
    try:
        # Metni sese dönüştür
        audio_data = text_to_speech(text)
        
        if audio_data:
            # Base64 formatına dönüştür
            audio_base64 = base64.b64encode(audio_data).decode('utf-8')
            
            # WebSocket üzerinden Unity'ye gönder
            await websocket.send_json({
                'type': 'audio_data',
                'data': {
                    'text': text,
                    'audio': audio_base64
                }
            })
            
            print(f"Ses verisi gönderildi: {text[:50]}...")
        else:
            # Ses dönüştürme başarısız olduysa sadece metni gönder
            await websocket.send_json({
                'type': 'message',
                'data': {
                    'text': text
                }
            })
    except Exception as e:
        print(f"Ses gönderimi hatası: {str(e)}")
        # Hata durumunda sadece metni göndermeyi dene
        try:
            await websocket.send_json({
                'type': 'message',
                'data': {
                    'text': text
                }
            })
        except Exception as e:
            print(f"Metin gönderimi de başarısız: {str(e)}")

@app.websocket("/ws/{client_id}")
async def websocket_endpoint(websocket: WebSocket, client_id: str):
    await websocket.accept()
    active_connections[client_id] = websocket
    print(f"Yeni WebSocket bağlantısı: {client_id}")
    
    try:
        # Bağlantı onayı gönder
        await websocket.send_json({
            'type': 'connection_response',
            'data': {'status': 'connected'}
        })
        print(f"Bağlantı onayı gönderildi: {client_id}")
        
        while True:
            data = await websocket.receive_json()
            print(f"Alınan mesaj: {data}")
            
            if data.get('type') == 'message':
                # Mesajı işle ve yanıt oluştur
                response = await process_interview_message(data.get('data'))
                print(f"Oluşturulan yanıt: {response}")
                
                # Yanıtı seslendir ve gönder
                audio_data = text_to_speech(response)
                if audio_data:
                    print(f"Ses verisi oluşturuldu, boyut: {len(audio_data)} bytes")
                    await websocket.send_json({
                        'type': 'audio',
                        'data': base64.b64encode(audio_data).decode('utf-8')
                    })
                    print("Ses verisi gönderildi")
                else:
                    print("Ses verisi oluşturulamadı, metin gönderiliyor")
                    await websocket.send_json({
                        'type': 'message',
                        'data': response
                    })
    except WebSocketDisconnect:
        print(f"Bağlantı koptu: {client_id}")
        del active_connections[client_id]
    except Exception as e:
        print(f"WebSocket hatası: {str(e)}")
        if client_id in active_connections:
            del active_connections[client_id]

async def process_interview_message(data: dict) -> str:
    """Gelen mesajı işler ve yanıt oluşturur"""
    try:
        session_id = data.get('session_id')
        message = data.get('message')
        
        if not session_id or not message:
            return "Geçersiz mesaj formatı"
        
        if session_id not in interview_sessions:
            return "Oturum bulunamadı"
        
        # Mesajı işle ve yanıt al
        request = MessageRequest(session_id=session_id, message=message)
        response = await send_message(request)
        
        return response.message
    except Exception as e:
        print(f"Mesaj işleme hatası: {str(e)}")
        return "Bir hata oluştu, lütfen tekrar deneyin."

class StageStatus(str, Enum):
    NOT_STARTED = "not_started"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"

class InterviewStage(BaseModel):
    id: str
    name: str
    description: str
    status: StageStatus = StageStatus.NOT_STARTED
    attempts: int = 0
    questions: List[Dict[str, Any]] = []
    satisfaction_score: int = 0  # 0-100 arası

class InterviewSession(BaseModel):
    id: str
    position: str
    candidate_name: str
    current_stage_index: int = 0
    stages: List[InterviewStage]
    completed: bool = False
    overall_feedback: str = ""
    chat_history: List[Dict[str, Any]] = []

class InterviewRequest(BaseModel):
    position: str
    candidate_name: str
    custom_stages: Optional[List[Dict[str, str]]] = None

class MessageRequest(BaseModel):
    session_id: str
    message: str

class InterviewResponse(BaseModel):
    session_id: str
    message: str
    current_stage: InterviewStage
    is_completed: bool
    overall_feedback: Optional[str] = None

# Varsayılan mülakat aşamaları
DEFAULT_INTERVIEW_STAGES = [
    {
        "id": "intro",
        "name": "Tanışma ve Giriş",
        "description": "Adayla tanışma ve temel bilgilerin alınması"
    },
    {
        "id": "experience",
        "name": "İş Deneyimi",
        "description": "Adayın önceki iş deneyimleri ve projeleri"
    },
    {
        "id": "technical",
        "name": "Teknik Beceriler",
        "description": "Adayın teknik bilgi ve becerileri"
    },
    {
        "id": "behavioral",
        "name": "Davranışsal Sorular",
        "description": "Problem çözme, takım çalışması, stres yönetimi vb."
    },
    {
        "id": "company_fit",
        "name": "Şirket Uyumu",
        "description": "Adayın şirket kültürüne ve pozisyona uygunluğu"
    },
    {
        "id": "questions",
        "name": "Aday Soruları",
        "description": "Adayın şirket ve pozisyon hakkında soruları"
    }
]

def generate_with_gemini(prompt: str, chat_history: Optional[List[Dict[str, Any]]] = None) -> str:
    """Gemini API'ye HTTP isteği ile direkt erişim sağlayan fonksiyon"""
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={GEMINI_API_KEY}"
    
    headers = {
        "Content-Type": "application/json"
    }
    
    # Sohbet geçmişi varsa, onu da ekle
    if chat_history:
        data = {
            "contents": chat_history + [{"role": "user", "parts": [{"text": prompt}]}]
        }
    else:
        data = {
            "contents": [{"role": "user", "parts": [{"text": prompt}]}]
        }
    
    response = requests.post(url, headers=headers, json=data)
    
    if response.status_code != 200:
        raise Exception(f"Gemini API hatası: {response.status_code} - {response.text}")
    
    response_json = response.json()
    
    # API yanıtından metni çıkart
    try:
        return response_json["candidates"][0]["content"]["parts"][0]["text"]
    except (KeyError, IndexError) as e:
        raise Exception(f"Gemini API yanıt formatı beklenenden farklı: {str(e)}")

def generate_stage_questions(position: str, stage: InterviewStage, candidate_name: str) -> List[Dict[str, Any]]:
    """Belirli bir aşama için soru listesi oluşturur"""
    
    prompt = f"""
    # MÜLAKAT SORULARI OLUŞTURMA
    
    ## POZİSYON: {position}
    ## AŞAMA: {stage.name} - {stage.description}
    ## ADAY: {candidate_name}
    
    Bu aşama için adaya sorulacak 3-5 soru oluştur. 
    Sorular, sohbet havasında ve doğal olmalı, klasik mülakat soruları gibi katı olmamalı.
    Her soru, adayı daha iyi tanımak ve belirtilen aşama için gerekli bilgileri almak amaçlı olmalı.
    
    Yanıtı aşağıdaki JSON formatında ver:
    
    ```json
    [
        {{
            "question": "Soru metni",
            "intent": "Bu sorunun amacının kısa açıklaması",
            "expected_themes": ["Yanıtta beklenen tema 1", "Tema 2", "Tema 3"]
        }},
        {{
            "question": "Soru metni 2",
            "intent": "Bu sorunun amacının kısa açıklaması",
            "expected_themes": ["Yanıtta beklenen tema 1", "Tema 2", "Tema 3"]
        }}
    ]
    ```
    
    Sadece JSON çıktısını ver, başka metin yazma.
    """
    
    response = generate_with_gemini(prompt)
    
    # JSON çıktısını bul ve ayrıştır
    json_str = response
    if "```json" in response:
        json_str = response.split("```json")[1].split("```")[0].strip()
    elif "```" in response:
        json_str = response.split("```")[1].split("```")[0].strip()
    
    try:
        return json.loads(json_str)
    except json.JSONDecodeError:
        # JSON ayrıştırma hatası durumunda, varsayılan sorular
        return [
            {
                "question": f"{stage.name} hakkında bize biraz bilgi verebilir misiniz?",
                "intent": "Genel bilgi toplama",
                "expected_themes": ["Deneyim", "Yetkinlik", "Motivasyon"]
            }
        ]

def evaluate_response(session: InterviewSession, stage: InterviewStage, message: str) -> dict:
    """Adayın yanıtını değerlendirir ve bir sonraki adımı belirler"""
    
    # Sohbet geçmişini oluştur
    chat_for_context = []
    
    # Önceki 10 mesajı (veya daha az) geçmişe ekle
    for msg in session.chat_history[-10:]:
        role = "user" if msg["is_user"] else "model"
        chat_for_context.append({"role": role, "parts": [{"text": msg["content"]}]})
    
    # Değerlendirme promptu oluştur
    prompt = f"""
    # MÜLAKAT YANITI DEĞERLENDİRME
    
    ## POZİSYON: {session.position}
    ## AŞAMA: {stage.name} - {stage.description}
    ## ADAY: {session.candidate_name}
    
    Adayın aşağıdaki yanıtını değerlendir ve bu aşama için ne kadar tatmin edici olduğunu belirle.
    Değerlendirme sonucunda aday ile doğal bir sohbet akışı içinde devam etmek için yanıt oluşturacaksın.
    
    ## ADAY YANITI:
    ```
    {message}
    ```
    
    ## BEKLENTİLER:
    Aşağıdaki konulara değinilmesi bekleniyor:
    {' / '.join([theme for q in stage.questions for theme in q.get('expected_themes', [])])}
    
    ## DEĞERLENDİRME KRİTERLERİ:
    1. İçeriğin kapsamlılığı ve derinliği (40 puan)
    2. Yanıtın aşama konusuyla ilgisi (30 puan)
    3. İfade netliği ve iletişim becerisi (20 puan)
    4. Özgünlük ve kişisel deneyim (10 puan)
    
    ## PUANLAMA KILAVUZU:
    * 80-100: Mükemmel yanıt, tüm beklentileri karşılıyor, aşamayı tamamlamalı
    * 60-79: İyi yanıt, çoğu beklentiyi karşılıyor, aşamayı tamamlamalı  
    * 40-59: Ortalama yanıt, bazı beklentileri karşılıyor, ek soru sorulmalı
    * 0-39: Yetersiz yanıt, çok az beklentiyi karşılıyor, ek soru sorulmalı
    
    ## YANIT ÖRNEKLERİ:
    Düşük puan (0-39) için örnek yanıtlar:
    - "Sanırım konudan biraz uzaklaştık. [Spesifik bir soru]"
    - "Bu konuyu biraz daha açmak isterim. [Spesifik bir soru]"
    
    Orta puan (40-59) için örnek yanıtlar:
    - "Anlıyorum. [Daha detaylı bir soru]"
    - "İlginç. [Konuyu derinleştiren bir soru]"
    
    Yüksek puan (60+) için örnek yanıtlar (ancak hala ek bilgiye ihtiyaç varsa):
    - "Çok güzel bir perspektif. [İlave bir soru]"
    - "İlginç bir bakış açısı. [Konuyu detaylandıran bir soru]"
    
    ## DEĞERLENDİRME YANITI:
    Aşağıdaki JSON formatında yanıtla:
    
    ```json
    {{
        "satisfaction_score": 0-100 arası sayısal değer,
        "stage_complete": true/false,
        "next_question": "Adaya sorulacak bir sonraki soru. Yanıt tatmin ediciyse bu bölüm boş olabilir."
    }}
    ```
    
    Sadece JSON çıktısını ver, başka metin yazma.
    """
    
    response = generate_with_gemini(prompt, chat_for_context)
    
    # JSON çıktısını bul ve ayrıştır
    json_str = response
    if "```json" in response:
        json_str = response.split("```json")[1].split("```")[0].strip()
    elif "```" in response:
        json_str = response.split("```")[1].split("```")[0].strip()
    
    try:
        result = json.loads(json_str)
        return result
    except json.JSONDecodeError:
        # JSON ayrıştırma hatası durumunda, varsayılan yanıt
        return {
            "satisfaction_score": 50,
            "stage_complete": False,
            "next_question": "Bu konuda biraz daha detay verebilir misiniz?"
        }

def generate_interview_completion(session: InterviewSession) -> str:
    """Mülakat tamamlandığında genel bir değerlendirme oluşturur"""
    
    # Değerlendirme promptu oluştur
    stage_summaries = []
    for stage in session.stages:
        stage_summary = f"- {stage.name}: Puan {stage.satisfaction_score}/100"
        stage_summaries.append(stage_summary)
    
    prompt = f"""
    # MÜLAKAT DEĞERLENDİRME RAPORU
    
    ## POZİSYON: {session.position}
    ## ADAY: {session.candidate_name}
    
    Mülakatın tüm aşamaları tamamlandı. Aşağıdaki puan ve gözlemlere dayanarak adaya detaylı bir değerlendirme raporu oluştur.
    
    ## AŞAMA PUANLARI:
    {chr(10).join(stage_summaries)}
    
    ## DEĞERLENDİRME İSTEĞİ:
    1. Adayın güçlü yönlerini değerlendir (3-4 madde)
    2. Geliştirilmesi gereken alanları belirt (2-3 madde)
    3. Pozisyona uygunluk değerlendirmesi yap (1 paragraf)
    4. Genel bir tavsiye oluştur (1 paragraf)
    
    Mülakat feedback'ini dostça ve yapıcı bir şekilde oluştur. Türkçe dilini kullan.
    """
    
    # Sohbet geçmişi olmadan değerlendirme yap
    response = generate_with_gemini(prompt)
    return response

def format_bot_response(session: InterviewSession, stage: InterviewStage, is_new_stage: bool, evaluation: Optional[dict] = None) -> str:
    """Bot yanıtını uygun şekilde biçimlendirir"""
    
    # Mülakat tamamlanmışsa
    if session.completed:
        return session.overall_feedback
    
    # Yeni aşamaya geçildiyse, doğal bir geçiş mesajı oluştur
    if is_new_stage:
        # Aşama başlıklarını kaldırdık, daha doğal bir sohbet akışı için
        if stage.id == "intro":
            # İlk aşama için özel başlangıç
            if stage.questions and len(stage.questions) > 0:
                return f"{stage.questions[0]['question']}"
            else:
                return "Öncelikle kendinizden biraz bahseder misiniz?"
        
        # Diğer aşamalara doğal geçiş
        transition_phrases = {
            "experience": "Şimdi biraz iş deneyimlerinizden bahsedelim. ",
            "technical": "Biraz teknik becerilerinizden konuşalım. ",
            "behavioral": "Çalışma tarzınız hakkında merak ettiğim birkaç şey var. ",
            "company_fit": "Şimdi biraz beklentilerinizden ve kariyer hedeflerinizden bahsedelim. ",
            "questions": "Son olarak, bana sormak istediğiniz sorular var mı? "
        }
        
        transition = transition_phrases.get(stage.id, "")
        
        if stage.questions and len(stage.questions) > 0:
            return f"{transition}{stage.questions[0]['question']}"
        else:
            return f"{transition}Bu konuda düşüncelerinizi paylaşır mısınız?"
    
    # Değerlendirme varsa ve aşama tamamlanmadıysa, bir sonraki soruyu sor
    if evaluation:
        satisfaction_score = evaluation.get("satisfaction_score", 0)
        next_question = evaluation.get("next_question", "")
        
        # Değerlendirme puanı düşükse ve maksimum deneme sayısına ulaşılmadıysa
        if not evaluation.get("stage_complete", False) and stage.attempts < 3:  # 3'e çıkarıldı (ilk yanıt + 2 ek deneme)
            # Puanlama durumuna göre doğal diyalog oluştur
            import random
            
            # Çok düşük puan (0-39) - bağlamdan uzak veya çok yetersiz
            if satisfaction_score < 40:
                low_responses = [
                    f"Sanırım konudan biraz uzaklaştık. {next_question}",
                    f"Bu konuyu biraz daha açmak isterim. {next_question}",
                    f"Belki biraz daha spesifik olabilir miyiz? {next_question}",
                    f"İlginç, ama sanırım aradığım bilgiye tam ulaşamadım. {next_question}"
                ]
                return random.choice(low_responses)
            
            # Orta puan (40-59) - ek detaya ihtiyaç var
            elif satisfaction_score < 60:
                med_responses = [
                    f"Anlıyorum. {next_question}",
                    f"İlginç. {next_question}",
                    f"Teşekkür ederim. {next_question}",
                    f"Bu iyi bir başlangıç. {next_question}"
                ]
                return random.choice(med_responses)
            
            # İyi puan (60+) ama hala detay gerekiyor
            else:
                high_responses = [
                    f"Çok güzel bir perspektif. {next_question}",
                    f"İlginç bir bakış açısı. {next_question}",
                    f"Bu gerçekten değerli bir bilgi. {next_question}",
                    f"Harika. {next_question}"
                ]
                return random.choice(high_responses)
        
        # Maksimum deneme sayısına ulaşıldıysa veya yanıt tatmin ediciyse
        if stage.id == session.stages[-1].id:  # Son aşamadaysa
            return "Bu bilgiler için teşekkür ederim. Görüşmemizi burada sonlandırabiliriz. Değerlendirme sonucunu yakında sizinle paylaşacağız."
        else:
            # Bir sonraki aşamaya doğal geçiş
            next_stage = session.stages[session.current_stage_index + 1]
            transition_phrases = {
                "experience": "Anladım, teşekkür ederim. Peki, daha önceki iş deneyimlerinizle ilgili biraz konuşabilir miyiz?",
                "technical": "Teşekkürler. Şimdi biraz teknik bilgi ve becerilerinizden bahsedelim.",
                "behavioral": "İş deneyimleriniz etkileyici. Peki, zorlu durumlarla nasıl başa çıktığınız hakkında konuşabilir miyiz?",
                "company_fit": "Anladım. Şimdi, kariyer hedefleriniz ve şirket kültürüyle ilgili beklentileriniz neler?",
                "questions": "Harika, teşekkürler. Son olarak, bana sormak istediğiniz herhangi bir soru var mı?"
            }
            
            return transition_phrases.get(next_stage.id, "Şimdi başka bir konuya geçelim.")
    
    # Varsayılan yanıt
    return "Biraz daha detaylı bilgi verebilir misiniz?"

@app.get("/")
async def root():
    return {"message": "Mülakat Simülasyonu API'sine Hoş Geldiniz"}

@app.post("/start-interview", response_model=InterviewResponse)
async def start_interview(request: InterviewRequest):
    """Yeni bir mülakat başlatır"""
    
    session_id = str(uuid.uuid4())
    
    # Aşamaları oluştur
    stages = []
    stage_data = request.custom_stages if request.custom_stages else DEFAULT_INTERVIEW_STAGES
    
    for stage_info in stage_data:
        stage = InterviewStage(
            id=stage_info["id"],
            name=stage_info["name"],
            description=stage_info["description"]
        )
        stages.append(stage)
    
    # Mülakat oturumu oluştur
    session = InterviewSession(
        id=session_id,
        position=request.position,
        candidate_name=request.candidate_name,
        stages=stages
    )
    
    # İlk aşamayı başlat
    current_stage = session.stages[0]
    current_stage.status = StageStatus.IN_PROGRESS
    
    # İlk aşama için soruları oluştur
    current_stage.questions = generate_stage_questions(
        session.position, 
        current_stage,
        session.candidate_name
    )
    
    # Mülakat oturumunu kaydet
    interview_sessions[session_id] = session
    
    # İlk aşamanın ilk sorusunu oluştur
    first_question = format_bot_response(session, current_stage, True)
    
    # İlk soruyu sohbet geçmişine ekle
    session.chat_history.append({
        "content": first_question,
        "is_user": False,
        "timestamp": "now"
    })
    
    # WebSocket üzerinden ilk mesajı seslendir
    if session_id in active_connections:
        websocket = active_connections[session_id]
        try:
            audio_data = text_to_speech(first_question)
            if audio_data:
                await websocket.send_json({
                    'type': 'audio',
                    'data': base64.b64encode(audio_data).decode('utf-8')
                })
                print(f"İlk soru WebSocket üzerinden seslendirildi: {first_question[:50]}...")
        except Exception as e:
            print(f"İlk soru seslendirme hatası: {str(e)}")
    
    return InterviewResponse(
        session_id=session_id,
        message=first_question,
        current_stage=current_stage,
        is_completed=False
    )

@app.post("/send-message", response_model=InterviewResponse)
async def send_message(request: MessageRequest):
    """Adayın mesajını işler ve yanıt döner"""
    
    session_id = request.session_id
    
    # Mülakat oturumunu kontrol et
    if session_id not in interview_sessions:
        raise HTTPException(status_code=404, detail="Mülakat oturumu bulunamadı")
    
    session = interview_sessions[session_id]
    
    # Mülakat tamamlandıysa sadece geri bildirim döndür
    if session.completed:
        return InterviewResponse(
            session_id=session_id,
            message=session.overall_feedback,
            current_stage=session.stages[session.current_stage_index],
            is_completed=True,
            overall_feedback=session.overall_feedback
        )
    
    # Adayın mesajını sohbet geçmişine ekle
    session.chat_history.append({
        "content": request.message,
        "is_user": True,
        "timestamp": "now"
    })
    
    current_stage = session.stages[session.current_stage_index]
    
    # Yanıtı değerlendir
    evaluation = evaluate_response(session, current_stage, request.message)
    
    # Satisfaction score'u güncelle (ortalama olarak)
    if current_stage.satisfaction_score == 0:
        current_stage.satisfaction_score = evaluation.get("satisfaction_score", 0)
    else:
        current_stage.satisfaction_score = (current_stage.satisfaction_score + evaluation.get("satisfaction_score", 0)) // 2
    
    current_stage.attempts += 1
    is_new_stage = False
    
    # Aşamayı tamamlama veya bir sonraki aşamaya geçme kararı
    if evaluation.get("stage_complete", False) or current_stage.attempts >= 3:
        current_stage.status = StageStatus.COMPLETED
        
        # Sonraki aşamaya geçiş
        if session.current_stage_index < len(session.stages) - 1:
            session.current_stage_index += 1
            next_stage = session.stages[session.current_stage_index]
            next_stage.status = StageStatus.IN_PROGRESS
            
            # Sonraki aşama için soruları oluştur
            next_stage.questions = generate_stage_questions(
                session.position, 
                next_stage,
                session.candidate_name
            )
            
            current_stage = next_stage
            is_new_stage = True
        else:
            # Mülakat tamamlandı
            session.completed = True
            session.overall_feedback = generate_interview_completion(session)
    
    # Bot yanıtını oluştur
    if session.completed:
        bot_response = session.overall_feedback
    else:
        bot_response = format_bot_response(session, current_stage, is_new_stage, evaluation)
    
    # Bot yanıtını sohbet geçmişine ekle
    session.chat_history.append({
        "content": bot_response,
        "is_user": False,
        "timestamp": "now"
    })
    
    # Oturumu güncelle
    interview_sessions[session_id] = session
    
    # WebSocket üzerinden ses yanıtı gönder
    if session_id in active_connections:
        websocket = active_connections[session_id]
        try:
            audio_data = text_to_speech(bot_response)
            if audio_data:
                await websocket.send_json({
                    'type': 'audio',
                    'data': base64.b64encode(audio_data).decode('utf-8')
                })
                print(f"Ses yanıtı WebSocket üzerinden gönderildi: {bot_response[:50]}...")
        except Exception as e:
            print(f"Ses yanıtı gönderme hatası: {str(e)}")
    
    return InterviewResponse(
        session_id=session_id,
        message=bot_response,
        current_stage=current_stage,
        is_completed=session.completed,
        overall_feedback=session.overall_feedback if session.completed else None
    )

@app.get("/interview/{session_id}", response_model=InterviewSession)
async def get_interview(session_id: str):
    """Mülakat oturumu bilgilerini döndürür"""
    
    if session_id not in interview_sessions:
        raise HTTPException(status_code=404, detail="Mülakat oturumu bulunamadı")
    
    return interview_sessions[session_id]

@app.get("/status")
async def status():
    return {"status": "online"}

@app.get("/get-message")
async def get_message(session_id: str):
    if session_id not in interview_sessions:
        raise HTTPException(status_code=404, detail="Session not found")
    
    interview = interview_sessions[session_id]
    if interview.chat_history:
        message = interview.chat_history.pop(0)
        return message
    return None

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8001) 