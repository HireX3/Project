using UnityEngine;
using System.IO;

public class wav_Utility : MonoBehaviour
{
    public static AudioClip ToAudioClip(byte[] wavData)
    {
        using (var memoryStream = new MemoryStream(wavData))
        {
            using (var reader = new BinaryReader(memoryStream))
            {
                // WAV header bilgilerini oku
                reader.ReadBytes(44); // WAV header'ý atla

                // Ses verisini oku
                var samples = new float[wavData.Length - 44];
                for (int i = 0; i < samples.Length; i++)
                {
                    samples[i] = reader.ReadInt16() / 32768f;
                }

                // AudioClip oluþtur
                var audioClip = AudioClip.Create("WebSocketAudio", samples.Length, 1, 44100, false);
                audioClip.SetData(samples, 0);

                return audioClip;
            }
        }
    }
}