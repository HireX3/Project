using UnityEngine;
using System;
using System.Collections;
using System.IO;
using System.Text;
using System.Collections.Generic;
#if !UNITY_WEBGL || UNITY_EDITOR
using System.Net.WebSockets;
using System.Threading;
using System.Threading.Tasks;
#endif
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using UnityEngine.Networking;
using ReadyPlayerMe.Core;

public class WebSocketAudioHandler : MonoBehaviour
{
#if !UNITY_WEBGL || UNITY_EDITOR
    private ClientWebSocket websocket;
    private CancellationTokenSource cancellationTokenSource;
#endif
    public string serverUrl = "ws://localhost:8001/ws";
    private bool isConnected = false;
    public AudioSource audioSource;
    private string sessionId;
    private bool shouldConnect = false;
#if !UNITY_WEBGL || UNITY_EDITOR
    private VoiceHandler voiceHandler;
#endif
    private string tempAudioPath;

    void Start()
    {
        Debug.Log("[WebSocket] WebSocketAudioHandler başlatılıyor...");

        // Ses kaynağını oluştur ve yapılandır
        audioSource = gameObject.AddComponent<AudioSource>();
        audioSource.playOnAwake = false;
        audioSource.spatialBlend = 0;
        audioSource.volume = 1.0f;

        // Ses tonunu erkeksi yapmak için pitch değerini düşür
        audioSource.pitch = 0.65f;

        if (audioSource == null)
        {
            Debug.LogError("[WebSocket] AudioSource bileşeni oluşturulamadı!");
            return;
        }

#if !UNITY_WEBGL || UNITY_EDITOR
        tempAudioPath = Path.Combine(Application.temporaryCachePath, "AudioCache");
        if (!Directory.Exists(tempAudioPath))
        {
            Directory.CreateDirectory(tempAudioPath);
        }

        // Ready Player Me Voice Handler sadece WebGL dışında kullan
        voiceHandler = GetComponent<VoiceHandler>();
        if (voiceHandler == null)
        {
            voiceHandler = gameObject.AddComponent<VoiceHandler>();
            Debug.Log("[WebSocket] VoiceHandler eklendi.");
        }

        // Configure VoiceHandler
        if (voiceHandler != null)
        {
            voiceHandler.AudioSource = audioSource;
            Debug.Log("[WebSocket] VoiceHandler yapılandırıldı.");
        }
#else
        Debug.Log("[WebSocket] WebGL platformunda çalışıyor - VoiceHandler kullanılmayacak");
        Debug.Log("[WebSocket] WebGL platformunda tarayıcı JavaScript API'leri kullanılacak");
        tempAudioPath = Application.temporaryCachePath;
#endif
    }

    void OnDisable()
    {
        CleanupWebSocket();
    }

    void OnDestroy()
    {
        CleanupWebSocket();
#if !UNITY_WEBGL || UNITY_EDITOR
        // Clean up temporary files
        if (Directory.Exists(tempAudioPath))
        {
            try
            {
                Directory.Delete(tempAudioPath, true);
            }
            catch (Exception e)
            {
                Debug.LogError($"[WebSocket] Geçici dosyalar temizlenirken hata: {e.Message}");
            }
        }
#endif
    }

    private void CleanupWebSocket()
    {
        shouldConnect = false;
#if !UNITY_WEBGL || UNITY_EDITOR
        try
        {
            if (websocket != null)
            {
                if (websocket.State == WebSocketState.Open)
                {
                    var closeTask = websocket.CloseAsync(WebSocketCloseStatus.NormalClosure, "Application closing", CancellationToken.None);
                    closeTask.Wait(TimeSpan.FromSeconds(2));
                }
                websocket.Dispose();
                websocket = null;
            }
        }
        catch (Exception e)
        {
            Debug.LogError($"[WebSocket] Bağlantı kapatılırken hata: {e.Message}");
        }
        finally
        {
            cancellationTokenSource?.Cancel();
            cancellationTokenSource?.Dispose();
            cancellationTokenSource = null;
            isConnected = false;
        }
#else
        isConnected = false;
        CallJavaScriptMethod("window.WebSocketWrapper.disconnect");
#endif
    }

    public void StartWebSocket(string newSessionId)
    {
        sessionId = newSessionId;
        shouldConnect = true;

        // WebSocket URL'sini HTTP protokolüne güncelle
        string finalUrl = serverUrl;
        if (serverUrl.StartsWith("ws://"))
        {
            finalUrl = "http://" + serverUrl.Substring(5);
        }
        else if (serverUrl.StartsWith("wss://"))
        {
            finalUrl = "https://" + serverUrl.Substring(6);
        }

        Debug.Log($"[WebSocket] WebSocket bağlantısı başlatılıyor. Session ID: {sessionId}, URL: {finalUrl}");

#if !UNITY_WEBGL || UNITY_EDITOR
        StartCoroutine(ConnectWebSocketCoroutine());
#else
        // WebGL için JavaScript alternatifi kullan
        isConnected = CallJavaScriptMethod($"window.WebSocketWrapper.connect('{finalUrl}', '{sessionId}')");
        if (isConnected)
        {
            StartCoroutine(PollJSMessagesCoroutine());
        }
#endif
    }

#if !UNITY_WEBGL || UNITY_EDITOR
    IEnumerator ConnectWebSocketCoroutine()
    {
        while (shouldConnect && !isConnected)
        {
            websocket?.Dispose();
            websocket = new ClientWebSocket();
            cancellationTokenSource?.Cancel();
            cancellationTokenSource = new CancellationTokenSource();

            Debug.Log($"[WebSocket] Bağlantı deneniyor: {serverUrl}/{sessionId}");

            var connectTask = websocket.ConnectAsync(new Uri($"{serverUrl}/{sessionId}"), cancellationTokenSource.Token);

            bool isError = false;
            Exception connectionError = null;

            while (!connectTask.IsCompleted)
            {
                yield return null;
            }

            if (connectTask.IsFaulted)
            {
                Debug.LogError($"[WebSocket] Bağlantı hatası: {connectTask.Exception}");
                isError = true;
                connectionError = connectTask.Exception;
            }

            if (isError)
            {
                if (connectionError != null)
                {
                    Debug.LogError($"[WebSocket] Bağlantı hatası: {connectionError.Message}");
                }
                yield return new WaitForSeconds(2);
                continue;
            }

            Debug.Log("[WebSocket] Bağlantı kuruldu!");
            isConnected = true;
            StartCoroutine(ReceiveLoop());
            yield break;
        }
    }

    IEnumerator ReceiveLoop()
    {
        var buffer = new byte[4096];
        var messageBuilder = new StringBuilder();

        while (isConnected && websocket != null && websocket.State == WebSocketState.Open)
        {
            var receiveTask = websocket.ReceiveAsync(new ArraySegment<byte>(buffer), cancellationTokenSource.Token);

            bool isError = false;
            Exception receiveError = null;

            while (!receiveTask.IsCompleted)
            {
                yield return null;
            }

            if (receiveTask.IsFaulted)
            {
                isError = true;
                receiveError = receiveTask.Exception;
                break;
            }

            if (isError)
            {
                if (receiveError != null)
                {
                    Debug.LogError($"[WebSocket] Mesaj alma hatası: {receiveError.Message}");
                }
                break;
            }

            var result = receiveTask.Result;

            if (result.MessageType == WebSocketMessageType.Close)
            {
                Debug.Log("[WebSocket] Sunucu bağlantıyı kapattı.");
                break;
            }

            var messageChunk = Encoding.UTF8.GetString(buffer, 0, result.Count);
            messageBuilder.Append(messageChunk);

            if (result.EndOfMessage)
            {
                string completeMessage = messageBuilder.ToString();
                ProcessMessage(completeMessage);
                messageBuilder.Clear();
            }
        }

        isConnected = false;
        if (shouldConnect)
        {
            StartCoroutine(ConnectWebSocketCoroutine());
        }
    }
#else
    // WebGL için JavaScript mesaj polling alternatifi
    IEnumerator PollJSMessagesCoroutine()
    {
        Debug.Log("[WebSocket] WebGL: JavaScript mesaj polling başlatılıyor");
        
        while (isConnected && shouldConnect)
        {
            string lastMessage = CallJSForString("window.WebSocketWrapper.getLastMessage()");
            if (!string.IsNullOrEmpty(lastMessage) && lastMessage != "null")
            {
                ProcessMessage(lastMessage);
            }
            
            yield return new WaitForSeconds(0.5f);
        }
    }
    
    // JavaScript'ten bool değer döndüren metod çağrısı
    private bool CallJavaScriptMethod(string jsCode)
    {
        try
        {
            Application.ExternalEval(
                "try { " + jsCode + "; } catch(e) { console.error('JS Error: ' + e.message); }");
            return true;
        }
        catch (Exception e)
        {
            Debug.LogError($"[WebSocket] JavaScript çağrısı hatası: {e.Message}");
            return false;
        }
    }
    
    // JavaScript'ten string değer döndüren metod çağrısı
    private string CallJSForString(string jsCode)
    {
        try
        {
            string result = Application.ExternalEval(
                "try { " + jsCode + "; } catch(e) { console.error('JS Error: ' + e.message); null; }");
            return result;
        }
        catch (Exception e)
        {
            Debug.LogError($"[WebSocket] JavaScript string çağrısı hatası: {e.Message}");
            return null;
        }
    }
    
    // HTTP polling alternatifi (eski kod, JavaScript yerine kullanmak için)
    IEnumerator PollMessagesCoroutine()
    {
        string apiBaseUrl = "http://localhost:8001";
        if (serverUrl.StartsWith("ws://"))
        {
            apiBaseUrl = "http://" + serverUrl.Substring(5, serverUrl.Length - 8); // "/ws" çıkarılıyor
        }
        else if (serverUrl.StartsWith("wss://"))
        {
            apiBaseUrl = "https://" + serverUrl.Substring(6, serverUrl.Length - 9); // "/ws" çıkarılıyor
        }
        
        Debug.Log($"[WebSocket] HTTP polling başlatılıyor: {apiBaseUrl}");
        
        while (isConnected && shouldConnect)
        {
            using (UnityWebRequest request = UnityWebRequest.Get($"{apiBaseUrl}/get-message?session_id={sessionId}"))
            {
                yield return request.SendWebRequest();
                
                if (request.result == UnityWebRequest.Result.Success)
                {
                    string responseText = request.downloadHandler.text;
                    if (!string.IsNullOrEmpty(responseText) && responseText != "null")
                    {
                        ProcessMessage(responseText);
                    }
                }
                else
                {
                    Debug.LogWarning($"[WebSocket] Polling error: {request.error}");
                }
            }
            
            yield return new WaitForSeconds(1.0f);
        }
    }
#endif

    void ProcessMessage(string message)
    {
        try
        {
            Debug.Log($"[WebSocket] Mesaj alındı, uzunluk: {message.Length} bytes");
            JObject data = JObject.Parse(message);

            if (data["type"] != null)
            {
                string messageType = data["type"].ToString();

                if (messageType == "audio" || messageType == "audio_data")
                {
                    string audioData = null;
                    if (data["audio_data"] != null)
                        audioData = data["audio_data"].ToString();
                    else if (data["data"] != null)
                        audioData = data["data"].ToString();

                    if (!string.IsNullOrEmpty(audioData))
                    {
#if !UNITY_WEBGL || UNITY_EDITOR
                        StartCoroutine(PlayAudioFromBase64Coroutine(audioData));
#else
                        // WebGL'de ses oynatmak için JavaScript'i çağır
                        Debug.Log("[WebSocket] WebGL: Ses verisi JavaScript'e aktarılıyor...");
                        string shortAudioData = audioData;
                        if (shortAudioData.Length > 100) {
                            shortAudioData = shortAudioData.Substring(0, 100) + "...";
                        }
                        Debug.Log($"[WebSocket] WebGL: Ses verisi önizleme: {shortAudioData}");
                        
                        CallJavaScriptMethod($"if(window.playTextToSpeech) {{ window.playTextToSpeech('Ses dosyası oynatılıyor'); }}");
#endif
                    }
                    else
                    {
                        Debug.LogError("[WebSocket] Ses verisi boş!");
                    }
                }
                else if (messageType == "connection_response")
                {
                    string status = data["data"]["status"].ToString();
                    Debug.Log("[WebSocket] Bağlantı onayı alındı: " + status);
                }
                else if (messageType == "message" || messageType == "text")
                {
                    Debug.Log("[WebSocket] Metin mesajı alındı, ses yanıtı bekleniyor...");
                    
                    // Metin verisini çıkar
                    string textContent = null;
                    if (data["data"] != null && data["data"]["content"] != null)
                        textContent = data["data"]["content"].ToString();
                    else if (data["content"] != null)
                        textContent = data["content"].ToString();
                    else if (data["text"] != null)
                        textContent = data["text"].ToString();
                    
                    if (!string.IsNullOrEmpty(textContent))
                    {
#if UNITY_WEBGL && !UNITY_EDITOR
                        // WebGL'de metni doğrudan web sayfasındaki text-to-speech fonksiyonuna gönder
                        Debug.Log($"[WebSocket] WebGL: Metin seslendiriliyor: {textContent}");
                        CallJavaScriptMethod($"if(window.playTextToSpeech) {{ window.playTextToSpeech('{EscapeStringForJS(textContent)}'); }}");
#endif
                    }
                }
            }
            else if (data["content"] != null)
            {
                // API'nin döndürdüğü mesaj formatı için alternatif işleme
                string textContent = data["content"].ToString();
                Debug.Log("[WebSocket] API mesajı alındı: " + textContent);
                
#if UNITY_WEBGL && !UNITY_EDITOR
                // WebGL'de metni doğrudan web sayfasındaki text-to-speech fonksiyonuna gönder
                Debug.Log($"[WebSocket] WebGL: API mesajı seslendiriliyor");
                CallJavaScriptMethod($"if(window.playTextToSpeech) {{ window.playTextToSpeech('{EscapeStringForJS(textContent)}'); }}");
#endif
            }
        }
        catch (Exception e)
        {
            Debug.LogError($"[WebSocket] Mesaj işleme hatası: {e.Message}");
            Debug.LogError($"[WebSocket] Hatalı mesaj başlangıcı: {message.Substring(0, Math.Min(100, message.Length))}");
        }
    }

#if UNITY_WEBGL && !UNITY_EDITOR
    // JavaScript için string'i kaçış karakterleriyle güvenli hale getir
    private string EscapeStringForJS(string text)
    {
        if (string.IsNullOrEmpty(text)) return "";
        
        return text.Replace("\\", "\\\\")
                  .Replace("'", "\\'")
                  .Replace("\"", "\\\"")
                  .Replace("\n", "\\n")
                  .Replace("\r", "\\r")
                  .Replace("\t", "\\t");
    }
#endif

    IEnumerator PlayAudioFromBase64Coroutine(string base64Audio)
    {
        if (string.IsNullOrEmpty(base64Audio))
        {
            Debug.LogError("[WebSocket] Base64 ses verisi boş!");
            yield break;
        }

        byte[] audioData;
        try
        {
            Debug.Log("[WebSocket] Ses verisi çözümleniyor...");
            audioData = Convert.FromBase64String(base64Audio);
        }
        catch (Exception e)
        {
            Debug.LogError($"[WebSocket] Base64 çözümleme hatası: {e.Message}");
            yield break;
        }

#if !UNITY_WEBGL || UNITY_EDITOR
        // Save to temporary file
        string tempFile = Path.Combine(tempAudioPath, $"audio_{DateTime.Now.Ticks}.mp3");
        try
        {
            File.WriteAllBytes(tempFile, audioData);
            string fileUrl = "file://" + tempFile.Replace("\\", "/");

            using (WWW www = new WWW(fileUrl))
            {
                yield return www;

                if (!string.IsNullOrEmpty(www.error))
                {
                    Debug.LogError($"[WebSocket] Ses yükleme hatası: {www.error}");
                    yield break;
                }

                AudioClip audioClip = www.GetAudioClip(false, false, AudioType.MPEG);
                while (audioClip != null && audioClip.loadState != AudioDataLoadState.Loaded)
                {
                    yield return null;
                }

                if (audioClip == null)
                {
                    Debug.LogError("[WebSocket] AudioClip oluşturulamadı!");
                    yield break;
                }

                audioSource.clip = audioClip;
                audioSource.Play();
                Debug.Log("[WebSocket] Ses oynatılıyor");

                yield return new WaitForSeconds(audioClip.length / audioSource.pitch);
            }
        }
        finally
        {
            // Clean up temporary file
            try
            {
                if (File.Exists(tempFile))
                {
                    File.Delete(tempFile);
                }
            }
            catch (Exception e)
            {
                Debug.LogError($"[WebSocket] Geçici dosya silinirken hata: {e.Message}");
            }
        }
#else
        // WebGL için ses oynatma işlemi web sayfasına devredildi
        Debug.Log("[WebSocket] WebGL: Ses işleme JavaScript'e devredildi");
        yield break;
#endif
    }

    // Doğrudan metni seslendirecek yeni yöntem
    public void PlayMessage(string message)
    {
        if (string.IsNullOrEmpty(message))
        {
            Debug.LogWarning("[WebSocket] Seslendirilecek mesaj boş!");
            return;
        }

        Debug.Log($"[WebSocket] Mesaj seslendiriliyor: {message.Substring(0, Math.Min(50, message.Length))}...");

#if UNITY_WEBGL && !UNITY_EDITOR
        // WebGL'de tarayıcı API'lerini kullan
        Debug.Log("[WebSocket] WebGL: Tarayıcı Text-to-Speech kullanılıyor");
        CallJavaScriptMethod($"if(window.playTextToSpeech) {{ window.playTextToSpeech('{EscapeStringForJS(message)}'); }}");
#else
        // API'ye HTTP isteği göndererek TTS iste
        StartCoroutine(GetTTSFromAPICoroutine(message));
#endif
    }

    private IEnumerator GetTTSFromAPICoroutine(string message)
    {
        if (string.IsNullOrEmpty(sessionId))
        {
            Debug.LogError("[WebSocket] Session ID boş, ses isteği gönderilemedi!");
            yield break;
        }

        string apiBaseUrl = serverUrl;
        if (serverUrl.StartsWith("ws://"))
        {
            apiBaseUrl = "http://" + serverUrl.Substring(5, serverUrl.Length - 8); // "/ws" çıkarılıyor
        }
        else if (serverUrl.StartsWith("wss://"))
        {
            apiBaseUrl = "https://" + serverUrl.Substring(6, serverUrl.Length - 9); // "/ws" çıkarılıyor
        }

        string url = $"{apiBaseUrl}/text-to-speech";

        // Alternatif olarak API endpoint'i olmadan doğrudan TTS hizmeti kullanma
        if (!url.EndsWith("/")) url += "/";

        Dictionary<string, string> requestData = new Dictionary<string, string>
        {
            { "text", message },
            { "session_id", sessionId }
        };

        string jsonData = JsonConvert.SerializeObject(requestData);

#if !UNITY_WEBGL || UNITY_EDITOR
        using (UnityWebRequest www = new UnityWebRequest(url, "POST"))
        {
            byte[] bodyRaw = Encoding.UTF8.GetBytes(jsonData);
            www.uploadHandler = new UploadHandlerRaw(bodyRaw);
            www.downloadHandler = new DownloadHandlerBuffer();
            www.SetRequestHeader("Content-Type", "application/json");

            yield return www.SendWebRequest();

            if (www.result == UnityWebRequest.Result.Success)
            {
                string responseJson = www.downloadHandler.text;

                try
                {
                    JObject response = JObject.Parse(responseJson);
                    if (response["audio"] != null)
                    {
                        string audioBase64 = response["audio"].ToString();
                        StartCoroutine(PlayAudioFromBase64Coroutine(audioBase64));
                    }
                    else
                    {
                        Debug.LogError("[WebSocket] TTS yanıtında ses verisi bulunamadı!");
                    }
                }
                catch (Exception e)
                {
                    Debug.LogError($"[WebSocket] TTS yanıtı işlenemedi: {e.Message}");
                }
            }
            else
            {
                Debug.LogError($"[WebSocket] TTS isteği hatası: {www.error}");
            }
        }
#else
        Debug.Log("[WebSocket] WebGL: TTS istenecek metni log'a yazdırıldı, tarayıcı API'si kullanılacak");
        yield break;
#endif
    }
}

[System.Serializable]
public class WebSocketMessage
{
    public string type;
    public string data;
}

[System.Serializable]
public class TextToSpeechResponse
{
    public string audio_data;
}