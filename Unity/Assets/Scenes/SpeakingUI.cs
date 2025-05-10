using UnityEngine;
using UnityEngine.UI;

[RequireComponent(typeof(SpeakingAvatarDemo))]
public class SpeakingUI : MonoBehaviour
{
    [SerializeField] private string[] textToDisplay;
    
    private SpeakingAvatarDemo avatarDemo;
    private GameObject uiCanvas;
    private Button speakButton;
    private Text subtitleText;
    
    private void Awake()
    {
        avatarDemo = GetComponent<SpeakingAvatarDemo>();
        SetupUI();
    }
    
    private void SetupUI()
    {
        // Create Canvas
        uiCanvas = new GameObject("AvatarSpeakingUI");
        var canvas = uiCanvas.AddComponent<Canvas>();
        canvas.renderMode = RenderMode.ScreenSpaceOverlay;
        uiCanvas.AddComponent<CanvasScaler>();
        uiCanvas.AddComponent<GraphicRaycaster>();
        
        // Create Speak Button
        var buttonObj = new GameObject("SpeakButton");
        buttonObj.transform.SetParent(uiCanvas.transform, false);
        
        var buttonRect = buttonObj.AddComponent<RectTransform>();
        buttonRect.anchoredPosition = new Vector2(0, -Screen.height / 2 + 100);
        buttonRect.sizeDelta = new Vector2(200, 50);
        
        var buttonImage = buttonObj.AddComponent<Image>();
        buttonImage.color = new Color(0.2f, 0.6f, 1f);
        
        speakButton = buttonObj.AddComponent<Button>();
        speakButton.targetGraphic = buttonImage;
        
        // Add button text
        var buttonTextObj = new GameObject("ButtonText");
        buttonTextObj.transform.SetParent(buttonObj.transform, false);
        
        var textRect = buttonTextObj.AddComponent<RectTransform>();
        textRect.anchorMin = Vector2.zero;
        textRect.anchorMax = Vector2.one;
        textRect.sizeDelta = Vector2.zero;
        
        var buttonText = buttonTextObj.AddComponent<Text>();
        buttonText.text = "Konuş";
        buttonText.font = Resources.GetBuiltinResource<Font>("Arial.ttf");
        buttonText.fontSize = 24;
        buttonText.alignment = TextAnchor.MiddleCenter;
        buttonText.color = Color.white;
        
        // Create subtitle area
        var subtitleObj = new GameObject("Subtitle");
        subtitleObj.transform.SetParent(uiCanvas.transform, false);
        
        var subtitleRect = subtitleObj.AddComponent<RectTransform>();
        subtitleRect.anchoredPosition = new Vector2(0, -Screen.height / 2 + 200);
        subtitleRect.sizeDelta = new Vector2(Screen.width - 100, 100);
        
        subtitleText = subtitleObj.AddComponent<Text>();
        subtitleText.font = Resources.GetBuiltinResource<Font>("Arial.ttf");
        subtitleText.fontSize = 24;
        subtitleText.alignment = TextAnchor.MiddleCenter;
        subtitleText.color = Color.white;
        
        // Connect to SpeakingAvatarDemo
        var field = avatarDemo.GetType().GetField("speakButton", System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Instance);
        if (field != null) field.SetValue(avatarDemo, speakButton);
        
        field = avatarDemo.GetType().GetField("subtitleText", System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Instance);
        if (field != null) field.SetValue(avatarDemo, subtitleText);
    }
} 