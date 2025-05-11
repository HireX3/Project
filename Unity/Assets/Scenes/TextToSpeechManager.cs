using UnityEngine;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using UnityEngine.Networking;

public class TextToSpeechManager : MonoBehaviour
{
    [System.Serializable]
    public class VoiceConfig
    {
        public string language = "tr-TR";
        public string voiceName = "tr-TR-EmelNeural";
        public float pitch = 1.0f;
        public float rate = 1.0f;
    }

    [SerializeField] private VoiceConfig voiceConfig = new VoiceConfig();
    [SerializeField] private string[] textsToSpeak;
    [SerializeField] private string apiKey = "YOUR_AZURE_API_KEY"; // Azure Speech API anahtarını buraya ekleyin
    [SerializeField] private string region = "westeurope"; // Azure bölgenizi buraya ekleyin
    
    private readonly string outputFolder = "Assets/Resources/SpeechClips";
    private List<AudioClip> generatedClips = new List<AudioClip>();
    
    private SpeakingAvatarDemo avatarDemo;
    
    private void Start()
    {
        avatarDemo = GetComponent<SpeakingAvatarDemo>();
        Directory.CreateDirectory(outputFolder);
    }
    
    public void GenerateSpeechClips()
    {
        StartCoroutine(ProcessTextToSpeech());
    }
    
    private IEnumerator ProcessTextToSpeech()
    {
        generatedClips.Clear();
        
        for (int i = 0; i < textsToSpeak.Length; i++)
        {
            string text = textsToSpeak[i];
            string clipName = $"speech_{i}";
            
            yield return StartCoroutine(GenerateSpeechClip(text, clipName));
        }
        
        // Set clips to avatar
        if (avatarDemo != null)
        {
            // Set the clips via reflection since speechClips is private
            var field = avatarDemo.GetType().GetField("speechClips", System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Instance);
            if (field != null)
            {
                field.SetValue(avatarDemo, generatedClips.ToArray());
            }
        }
        
        Debug.Log($"Generated {generatedClips.Count} speech clips");
    }
    
    private IEnumerator GenerateSpeechClip(string text, string clipName)
    {
        // Buraya Azure veya başka bir Text-to-Speech servisi için kod ekleneecektir
        // Aşağıdaki kod sadece örnek gösterim amaçlıdır
        
        string ssmlText = $@"
        <speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='{voiceConfig.language}'>
            <voice name='{voiceConfig.voiceName}'>
                <prosody rate='{voiceConfig.rate}' pitch='{voiceConfig.pitch}'>
                    {text}
                </prosody>
            </voice>
        </speak>";
        
        using (UnityWebRequest www = new UnityWebRequest($"https://{region}.tts.speech.microsoft.com/cognitiveservices/v1", "POST"))
        {
            byte[] bodyRaw = System.Text.Encoding.UTF8.GetBytes(ssmlText);
            www.uploadHandler = new UploadHandlerRaw(bodyRaw);
            www.downloadHandler = new DownloadHandlerBuffer();
            www.SetRequestHeader("Content-Type", "application/ssml+xml");
            www.SetRequestHeader("Ocp-Apim-Subscription-Key", apiKey);
            www.SetRequestHeader("X-Microsoft-OutputFormat", "riff-24khz-16bit-mono-pcm");
            
            yield return www.SendWebRequest();
            
            if (www.result != UnityWebRequest.Result.Success)
            {
                Debug.LogError($"Error generating speech: {www.error}");
            }
            else
            {
                // Save audio file
                string filePath = Path.Combine(outputFolder, $"{clipName}.wav");
                File.WriteAllBytes(filePath, www.downloadHandler.data);
                
                // Load audio clip
                using (UnityWebRequest audioRequest = UnityWebRequestMultimedia.GetAudioClip("file://" + filePath, AudioType.WAV))
                {
                    yield return audioRequest.SendWebRequest();
                    
                    if (audioRequest.result == UnityWebRequest.Result.Success)
                    {
                        AudioClip clip = DownloadHandlerAudioClip.GetContent(audioRequest);
                        clip.name = text;
                        generatedClips.Add(clip);
                        
                        Debug.Log($"Generated speech clip: {clipName}");
                    }
                }
            }
        }
    }
    
    // Not: Bu kod örnek amaçlıdır. Gerçek uygulamada Azure, Google veya başka 
    // bir text-to-speech servisi API'larını kullanmanız gerekecektir.
} 