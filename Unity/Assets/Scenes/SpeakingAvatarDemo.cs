using UnityEngine;
using ReadyPlayerMe.Core;
using System.Collections;
using UnityEngine.UI;

public class SpeakingAvatarDemo : MonoBehaviour
{
    [SerializeField] private string avatarUrl = "https://models.readyplayer.me/67f296fa1ae672aa4f1ae12d.glb";
    [SerializeField] private AudioClip[] speechClips;
    [SerializeField] private Button speakButton;
    [SerializeField] private Text subtitleText;
    
    private GameObject avatar;
    private VoiceHandler voiceHandler;
    private AudioSource audioSource;
    
    private void Start()
    {
        LoadAvatar();
        
        if (speakButton != null)
        {
            speakButton.onClick.AddListener(StartSpeaking);
        }
    }
    
    private void LoadAvatar()
    {
        var avatarLoader = new AvatarObjectLoader();
        avatarLoader.OnCompleted += OnAvatarLoaded;
        avatarLoader.OnFailed += (sender, args) => Debug.LogError(args.Message);
        
        Debug.Log("Loading avatar: " + avatarUrl);
        avatarLoader.LoadAvatar(avatarUrl);
    }
    
    private void OnAvatarLoaded(object sender, CompletionEventArgs args)
    {
        avatar = args.Avatar;
        avatar.transform.position = Vector3.zero;
        avatar.transform.SetParent(transform);
        
        // Setup voice handler
        voiceHandler = avatar.AddComponent<VoiceHandler>();
        voiceHandler.AudioProvider = AudioProviderType.AudioClip;
        
        // Setup audio source
        audioSource = avatar.AddComponent<AudioSource>();
        voiceHandler.AudioSource = audioSource;
        
        Debug.Log("Avatar loaded and ready to speak");
    }
    
    public void StartSpeaking()
    {
        if (avatar == null || voiceHandler == null || speechClips.Length == 0)
        {
            Debug.LogWarning("Avatar not loaded or speech clips not set");
            return;
        }
        
        StartCoroutine(SpeakSequence());
    }
    
    private IEnumerator SpeakSequence()
    {
        foreach (var clip in speechClips)
        {
            if (clip != null)
            {
                // Set subtitle if available
                if (subtitleText != null)
                {
                    subtitleText.text = clip.name;
                }
                
                // Play audio clip for lip sync
                audioSource.clip = clip;
                voiceHandler.AudioClip = clip;
                audioSource.Play();
                
                // Wait until the clip is done playing
                yield return new WaitForSeconds(clip.length);
                
                // Small pause between sentences
                yield return new WaitForSeconds(0.5f);
            }
        }
        
        // Clear subtitle when done
        if (subtitleText != null)
        {
            subtitleText.text = "";
        }
    }
} 