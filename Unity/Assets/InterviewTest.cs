using UnityEngine;
using UnityEngine.UI;
using System;
using System.Net.Http;
using System.Text;
using Newtonsoft.Json;
using System.Threading.Tasks;
using TMPro;
using System.Collections;

public class InterviewTest : MonoBehaviour
{
    [Header("UI Bile�enleri")]
    public Button startButton;
    public Button sendButton;
    public TMP_InputField messageInput;
    public TextMeshProUGUI statusText;

    [Header("A� Ayarlar�")]
    [Tooltip("API sunucu URL'si")]
    public string apiBaseUrl = "http://127.0.0.1:8001/"; // Kendi API adresiniz ile de�i�tirin

    [Header("M�lakat�� �zellikleri")]
    [Tooltip("Otomatik kar��lama mesaj�")]
    public string welcomeMessage = "Merhaba ve g�r��meye ho� geldiniz! Ben bu m�lakatta sizinle konu�acak olan sanal m�lakat��y�m. Bug�n yaz�l�m geli�tirici pozisyonu i�in birka� soru sormak istiyorum. Endi�elenmeyin, bu herhangi bir s�nav de�il, sadece sizin deneyimlerinizi ve becerilerinizi anlamak i�in bir sohbet. Ba�lamadan �nce, kendinizi k�saca tan�tabilir misiniz? E�itim ge�mi�iniz, profesyonel deneyimleriniz ve bu pozisyona olan ilginiz hakk�nda biraz bilgi payla��rsan�z sevinirim.";

    [Header("Bile�enler")]
    public WebSocketAudioHandler audioHandler;

    [Header("Ses Ayarlar�")]
    [Range(0.5f, 2.0f)]
    public float audioPlaybackSpeed = 1.5f;

    private string sessionId;
    private bool isInterviewStarted = false;
    private bool isWaitingForResponse = false;
    private TextMeshProUGUI conversationHistory;

    void Start()
    {
        // WebSocketAudioHandler'� bul veya ekle
        audioHandler = GetComponent<WebSocketAudioHandler>();
        if (audioHandler == null)
        {
            audioHandler = gameObject.AddComponent<WebSocketAudioHandler>();
        }

        if (startButton != null)
            startButton.onClick.AddListener(StartInterview);

        if (sendButton != null)
            sendButton.onClick.AddListener(SendResponse);

        if (messageInput != null)
        {
            messageInput.onSubmit.AddListener((string text) => {
                if (Input.GetKeyDown(KeyCode.Return) || Input.GetKeyDown(KeyCode.KeypadEnter))
                {
                    SendResponse();
                }
            });
        }

        // Konu�ma ge�mi�i g�sterilecek metin alan�n� arama
        GameObject conversationPanel = GameObject.Find("ConversationPanel");
        if (conversationPanel != null)
        {
            Transform historyText = conversationPanel.transform.Find("ConversationHistory");
            if (historyText != null)
            {
                conversationHistory = historyText.GetComponent<TextMeshProUGUI>();
            }
        }

        UpdateUIState();
    }

    void Update()
    {
        // Ses oynatma h�z�n� ayarla
        if (audioHandler != null && audioHandler.audioSource != null)
        {
            audioHandler.audioSource.pitch = audioPlaybackSpeed;
        }
    }

    void UpdateUIState()
    {
        if (messageInput != null)
            messageInput.interactable = isInterviewStarted && !isWaitingForResponse;

        if (sendButton != null)
            sendButton.interactable = isInterviewStarted && !isWaitingForResponse;

        if (startButton != null)
            startButton.interactable = !isInterviewStarted;
    }

    async void StartInterview()
    {
        try
        {
            // Durum g�ncellemesi
            UpdateStatus("Ba�lan�yor...");

            using (var client = new HttpClient())
            {
                var requestData = new
                {
                    position = "Software Developer",
                    candidate_name = "Aday"
                };

                var content = new StringContent(
                    JsonConvert.SerializeObject(requestData),
                    Encoding.UTF8,
                    "application/json"
                );

                // API URL'sini normalize et
                string url = apiBaseUrl;
                if (!url.EndsWith("/")) url += "/";
                url += "start-interview";

                var response = await client.PostAsync(url, content);
                var responseString = await response.Content.ReadAsStringAsync();

                if (response.IsSuccessStatusCode)
                {
                    var interviewResponse = JsonConvert.DeserializeObject<InterviewResponse>(responseString);
                    sessionId = interviewResponse.session_id;
                    isInterviewStarted = true;

                    // Kar��lama mesaj�n� g�ster
                    string initialMessage = welcomeMessage;
                    DisplayMessage(initialMessage, false);

                    // Durum g�ncellemesi
                    UpdateStatus("Haz�r");

                    // WebSocket ba�lant�s�n� ba�lat
                    if (audioHandler != null)
                    {
                        // WebSocket URL'sini olu�tur
                        string wsUrl = url.Replace("http://", "ws://").Replace("https://", "wss://");
                        string wsBaseUrl = wsUrl.Substring(0, wsUrl.LastIndexOf("/")) + "/ws";

                        // WebSocket URL'sini set et
                        audioHandler.serverUrl = wsBaseUrl;
                        audioHandler.StartWebSocket(sessionId);

                        // Ba�lang�� mesaj�n�n seslendirilmesi i�in 1 saniye sonra �a��r (WebSocket ba�lant�s�n�n kurulmas� i�in zaman tan�)
                        StartCoroutine(PlayWelcomeMessageAfterDelay(initialMessage, 1.0f));
                    }

                    UpdateUIState();
                }
                else
                {
                    UpdateStatus("Hata");
                }
            }
        }
        catch (Exception e)
        {
            UpdateStatus("Ba�lant� Hatas�");
            Debug.LogError("M�lakat ba�latma hatas�: " + e.Message);
        }
    }

    public async void SendResponse()
    {
        if (isWaitingForResponse || string.IsNullOrEmpty(messageInput.text))
            return;

        string userMessage = messageInput.text;
        messageInput.text = "";

        // Kullan�c� mesaj�n� ekrana yaz
        DisplayMessage(userMessage, true);

        isWaitingForResponse = true;
        messageInput.interactable = false;
        sendButton.interactable = false;
        UpdateUIState();

        // Durum g�ncellemesi
        UpdateStatus("Yan�t Bekleniyor...");

        try
        {
            var request = new
            {
                session_id = sessionId,
                message = userMessage
            };

            using (var client = new HttpClient())
            {
                var content = new StringContent(
                    JsonConvert.SerializeObject(request),
                    Encoding.UTF8,
                    "application/json"
                );

                // API URL'sini normalize et
                string url = apiBaseUrl;
                if (!url.EndsWith("/")) url += "/";
                url += "send-message";

                var response = await client.PostAsync(url, content);

                if (response.IsSuccessStatusCode)
                {
                    var responseContent = await response.Content.ReadAsStringAsync();
                    var interviewResponse = JsonConvert.DeserializeObject<InterviewResponse>(responseContent);

                    // Yan�t� ekrana yaz
                    if (!string.IsNullOrEmpty(interviewResponse.message))
                    {
                        DisplayMessage(interviewResponse.message, false);
                    }

                    if (interviewResponse.is_completed)
                    {
                        UpdateStatus("Tamamland�");

                        // Biti� mesaj�n� ekrana yaz
                        if (!string.IsNullOrEmpty(interviewResponse.message))
                        {
                            DisplayMessage(interviewResponse.message, false);

                            // Biti� mesaj�n� seslendir
                            if (audioHandler != null)
                            {
                                audioHandler.PlayMessage(interviewResponse.message);
                            }
                        }

                        // De�erlendirme raporunu ekrana yaz (farkl� renkte)
                        if (!string.IsNullOrEmpty(interviewResponse.overall_feedback))
                        {
                            DisplayEvaluationReport(interviewResponse.overall_feedback);
                        }

                        messageInput.interactable = false;
                        sendButton.interactable = false;
                    }
                    else
                    {
                        UpdateStatus("Haz�r");
                        isWaitingForResponse = false;
                        UpdateUIState();
                    }
                }
                else
                {
                    UpdateStatus("Hata");
                    isWaitingForResponse = false;
                    UpdateUIState();
                }
            }
        }
        catch (Exception e)
        {
            UpdateStatus("Ba�lant� Hatas�");
            Debug.LogError("Yan�t g�nderme hatas�: " + e.Message);
            isWaitingForResponse = false;
            UpdateUIState();
        }
    }

    // Mesaj� g�r�nt�leme yard�mc� metodu
    private void DisplayMessage(string message, bool isUser)
    {
        if (conversationHistory != null)
        {
            // Mevcut mesaj ge�mi�ini al ve yeni mesaj� ekle
            string currentText = conversationHistory.text;
            string newMessage = isUser ?
                $"<color=#4CAF50><b>Aday:</b></color> {message}\n\n" :
                $"<color=#2196F3><b>M�lakat��:</b></color> {message}\n\n";

            conversationHistory.text = currentText + newMessage;

            // Otomatik kayd�rma i�in Canvas gruplama gerekebilir
            Canvas.ForceUpdateCanvases();
        }
    }

    // Durumu g�ncelle - Status k�sm�nda sadece durum g�sterilecek
    private void UpdateStatus(string status)
    {
        if (statusText != null)
        {
            statusText.text = status;
        }
    }

    private IEnumerator PlayWelcomeMessageAfterDelay(string message, float delay)
    {
        yield return new WaitForSeconds(delay);
        audioHandler.PlayMessage(message);
    }

    // De�erlendirme raporunu �zel formatta g�r�nt�leme
    private void DisplayEvaluationReport(string report)
    {
        if (conversationHistory != null && !string.IsNullOrEmpty(report))
        {
            // Mevcut mesaj ge�mi�ini al
            string currentText = conversationHistory.text;

            // Rapor ba�l��� ve i�eri�i
            string reportMessage =
                "<color=#FF9800><b>M�LAKAT DE�ERLEND�RME RAPORU</b></color>\n" +
                "<color=#FFC107>" + report + "</color>\n\n";

            // Raporu ekle
            conversationHistory.text = currentText + reportMessage;

            // Otomatik kayd�rma i�in Canvas gruplama gerekebilir
            Canvas.ForceUpdateCanvases();
        }
    }

    [System.Serializable]
    private class InterviewResponse
    {
        public string session_id;
        public string message;
        public bool is_completed;
        public string overall_feedback;
    }
}