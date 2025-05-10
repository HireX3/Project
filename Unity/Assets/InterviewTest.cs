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
    [Header("UI Bileþenleri")]
    public Button startButton;
    public Button sendButton;
    public TMP_InputField messageInput;
    public TextMeshProUGUI statusText;

    [Header("Að Ayarlarý")]
    [Tooltip("API sunucu URL'si")]
    public string apiBaseUrl = "http://127.0.0.1:8001/"; // Kendi API adresiniz ile deðiþtirin

    [Header("Mülakatçý Özellikleri")]
    [Tooltip("Otomatik karþýlama mesajý")]
    public string welcomeMessage = "Merhaba ve görüþmeye hoþ geldiniz! Ben bu mülakatta sizinle konuþacak olan sanal mülakatçýyým. Bugün yazýlým geliþtirici pozisyonu için birkaç soru sormak istiyorum. Endiþelenmeyin, bu herhangi bir sýnav deðil, sadece sizin deneyimlerinizi ve becerilerinizi anlamak için bir sohbet. Baþlamadan önce, kendinizi kýsaca tanýtabilir misiniz? Eðitim geçmiþiniz, profesyonel deneyimleriniz ve bu pozisyona olan ilginiz hakkýnda biraz bilgi paylaþýrsanýz sevinirim.";

    [Header("Bileþenler")]
    public WebSocketAudioHandler audioHandler;

    [Header("Ses Ayarlarý")]
    [Range(0.5f, 2.0f)]
    public float audioPlaybackSpeed = 1.5f;

    private string sessionId;
    private bool isInterviewStarted = false;
    private bool isWaitingForResponse = false;
    private TextMeshProUGUI conversationHistory;

    void Start()
    {
        // WebSocketAudioHandler'ý bul veya ekle
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

        // Konuþma geçmiþi gösterilecek metin alanýný arama
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
        // Ses oynatma hýzýný ayarla
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
            // Durum güncellemesi
            UpdateStatus("Baðlanýyor...");

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

                    // Karþýlama mesajýný göster
                    string initialMessage = welcomeMessage;
                    DisplayMessage(initialMessage, false);

                    // Durum güncellemesi
                    UpdateStatus("Hazýr");

                    // WebSocket baðlantýsýný baþlat
                    if (audioHandler != null)
                    {
                        // WebSocket URL'sini oluþtur
                        string wsUrl = url.Replace("http://", "ws://").Replace("https://", "wss://");
                        string wsBaseUrl = wsUrl.Substring(0, wsUrl.LastIndexOf("/")) + "/ws";

                        // WebSocket URL'sini set et
                        audioHandler.serverUrl = wsBaseUrl;
                        audioHandler.StartWebSocket(sessionId);

                        // Baþlangýç mesajýnýn seslendirilmesi için 1 saniye sonra çaðýr (WebSocket baðlantýsýnýn kurulmasý için zaman taný)
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
            UpdateStatus("Baðlantý Hatasý");
            Debug.LogError("Mülakat baþlatma hatasý: " + e.Message);
        }
    }

    public async void SendResponse()
    {
        if (isWaitingForResponse || string.IsNullOrEmpty(messageInput.text))
            return;

        string userMessage = messageInput.text;
        messageInput.text = "";

        // Kullanýcý mesajýný ekrana yaz
        DisplayMessage(userMessage, true);

        isWaitingForResponse = true;
        messageInput.interactable = false;
        sendButton.interactable = false;
        UpdateUIState();

        // Durum güncellemesi
        UpdateStatus("Yanýt Bekleniyor...");

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

                    // Yanýtý ekrana yaz
                    if (!string.IsNullOrEmpty(interviewResponse.message))
                    {
                        DisplayMessage(interviewResponse.message, false);
                    }

                    if (interviewResponse.is_completed)
                    {
                        UpdateStatus("Tamamlandý");

                        // Bitiþ mesajýný ekrana yaz
                        if (!string.IsNullOrEmpty(interviewResponse.message))
                        {
                            DisplayMessage(interviewResponse.message, false);

                            // Bitiþ mesajýný seslendir
                            if (audioHandler != null)
                            {
                                audioHandler.PlayMessage(interviewResponse.message);
                            }
                        }

                        // Deðerlendirme raporunu ekrana yaz (farklý renkte)
                        if (!string.IsNullOrEmpty(interviewResponse.overall_feedback))
                        {
                            DisplayEvaluationReport(interviewResponse.overall_feedback);
                        }

                        messageInput.interactable = false;
                        sendButton.interactable = false;
                    }
                    else
                    {
                        UpdateStatus("Hazýr");
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
            UpdateStatus("Baðlantý Hatasý");
            Debug.LogError("Yanýt gönderme hatasý: " + e.Message);
            isWaitingForResponse = false;
            UpdateUIState();
        }
    }

    // Mesajý görüntüleme yardýmcý metodu
    private void DisplayMessage(string message, bool isUser)
    {
        if (conversationHistory != null)
        {
            // Mevcut mesaj geçmiþini al ve yeni mesajý ekle
            string currentText = conversationHistory.text;
            string newMessage = isUser ?
                $"<color=#4CAF50><b>Aday:</b></color> {message}\n\n" :
                $"<color=#2196F3><b>Mülakatçý:</b></color> {message}\n\n";

            conversationHistory.text = currentText + newMessage;

            // Otomatik kaydýrma için Canvas gruplama gerekebilir
            Canvas.ForceUpdateCanvases();
        }
    }

    // Durumu güncelle - Status kýsmýnda sadece durum gösterilecek
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

    // Deðerlendirme raporunu özel formatta görüntüleme
    private void DisplayEvaluationReport(string report)
    {
        if (conversationHistory != null && !string.IsNullOrEmpty(report))
        {
            // Mevcut mesaj geçmiþini al
            string currentText = conversationHistory.text;

            // Rapor baþlýðý ve içeriði
            string reportMessage =
                "<color=#FF9800><b>MÜLAKAT DEÐERLENDÝRME RAPORU</b></color>\n" +
                "<color=#FFC107>" + report + "</color>\n\n";

            // Raporu ekle
            conversationHistory.text = currentText + reportMessage;

            // Otomatik kaydýrma için Canvas gruplama gerekebilir
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