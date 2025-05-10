/**
 * WebGL ve AudioContext sorunlarını gidermek için yardımcı fonksiyonlar
 */

// AudioContext'i başlatmak için kullanıcı etkileşimi gerekli
(function() {
  // Global değişkenler
  window.audioStarted = false;
  
  // AudioContext'i başlatmaya çalışan fonksiyon
  window.startAudioContext = function() {
    if (window.audioStarted) return;
    
    try {
      // Tüm ses bağlamlarını bul ve başlat
      if (typeof AudioContext !== 'undefined' || typeof webkitAudioContext !== 'undefined') {
        var actx = window.AudioContext || window.webkitAudioContext;
        
        // AudioContext.prototype.resume metodunu kullanarak tüm ses bağlamlarını başlat
        var patchedResume = actx.prototype.resume;
        actx.prototype.resume = function() {
          var p = patchedResume.call(this);
          if (p) p.then(function() { 
            console.log('AudioContext başlatıldı'); 
          });
          return p;
        };
        
        // Mevcut tüm AudioContext nesnelerini başlat
        var pageAudios = [];
        var getAudioContext = Object.getOwnPropertyDescriptor(window, 'AudioContext');
        if (getAudioContext) {
          var audioContexts = [];
          for (var i in window) {
            if (window[i] instanceof AudioContext) {
              audioContexts.push(window[i]);
            }
          }
          
          audioContexts.forEach(function(ctx) {
            if (ctx.state === 'suspended') {
              ctx.resume();
            }
          });
        }

        // WebGL Audio bağlantısını düzelt
        if (window.unityInstance) {
          try {
            // Unity'nin ses sistemi ile entegrasyon
            var unityAudio = window.unityInstance.Module.WebGLAudio;
            if (unityAudio && unityAudio.audioContext && unityAudio.audioContext.state === 'suspended') {
              unityAudio.audioContext.resume();
            }
          } catch (e) {
            console.warn('Unity WebGLAudio düzeltme hatası:', e);
          }
        }
        
        window.audioStarted = true;
        console.log('Ses sistemleri etkinleştirildi');
      }
      
      // SpeechSynthesis API'sini etkinleştir
      if ('speechSynthesis' in window) {
        try {
          window.speechSynthesis.getVoices();
          console.log('SpeechSynthesis etkinleştirildi');
        } catch (e) {
          console.warn('SpeechSynthesis hatası:', e);
        }
      }
    } catch (e) {
      console.warn('Ses başlatma hatası:', e);
    }
  };
  
  // WebGL bağlamında internalformat hatalarını gidermek için
  window.fixWebGLErrors = function() {
    // WebGL bağlamını al
    var canvas = document.querySelector('#unity-canvas');
    if (!canvas) return;
    
    try {
      // WebGL bağlamını oluştur
      var contextOptions = {
        preserveDrawingBuffer: false,
        powerPreference: 'high-performance',
        failIfMajorPerformanceCaveat: false,
        antialias: false,
        alpha: false,
        stencil: false,
        desynchronized: true,
        xrCompatible: false,
        premultipliedAlpha: false
      };
      
      var gl = canvas.getContext('webgl2', contextOptions) || 
               canvas.getContext('webgl', contextOptions) || 
               canvas.getContext('experimental-webgl', contextOptions);
      
      if (gl) {
        // getInternalformatParameter hatasını önle
        if (gl instanceof WebGL2RenderingContext) {
          var originalGetInternalformatParameter = gl.getInternalformatParameter;
          gl.getInternalformatParameter = function() {
            try {
              return originalGetInternalformatParameter.apply(this, arguments);
            } catch (e) {
              console.warn('getInternalformatParameter hatası önlendi', e);
              return null;
            }
          };
        }
        
        // WebGL bellek sınırlarını kontrol et
        try {
          if (gl.getParameter) {
            console.log('MAX_TEXTURE_SIZE:', gl.getParameter(gl.MAX_TEXTURE_SIZE));
            console.log('MAX_VIEWPORT_DIMS:', gl.getParameter(gl.MAX_VIEWPORT_DIMS));
          }
        } catch (e) {
          console.warn('WebGL parametre sorgulaması hatası:', e);
        }
        
        // CDP hatalarını engelle
        var originalSendBeacon = navigator.sendBeacon;
        if (originalSendBeacon) {
          navigator.sendBeacon = function(url, data) {
            if (url.indexOf('cdp.cloud.unity3d.com') !== -1) {
              console.log('Unity telemetri isteği engellendi');
              return true;
            }
            return originalSendBeacon.call(navigator, url, data);
          };
        }
      }
    } catch (e) {
      console.warn('WebGL fix hatası:', e);
    }
  };
  
  // Safari için ek düzeltmeler
  function fixSafariIssues() {
    if (/^((?!chrome|android).)*safari/i.test(navigator.userAgent)) {
      // Safari'de WebGL sorunlarını düzelt
      console.log('Safari tarayıcısı algılandı, ek düzeltmeler uygulanıyor');
      
      // Safari için AudioContext polyfill
      window.AudioContext = window.AudioContext || window.webkitAudioContext;
      
      // Safari'de bazı WebGL hatalarını önleyen ek düzeltmeler
      if (window.WebGLRenderingContext) {
        var originalGetShaderParameter = WebGLRenderingContext.prototype.getShaderParameter;
        WebGLRenderingContext.prototype.getShaderParameter = function(shader, pname) {
          try {
            return originalGetShaderParameter.call(this, shader, pname);
          } catch (e) {
            console.warn('Safari WebGL getShaderParameter hatası önlendi', e);
            return false;
          }
        };
      }
    }
  }
  
  // Tüm giriş olaylarına dinleyiciler ekle
  function addInputListeners() {
    var interactionEvents = ['mousedown', 'touchstart', 'keydown'];
    
    function handleInteraction(e) {
      window.startAudioContext();
      window.fixWebGLErrors();
      
      // Kullanıcı etkileşiminde start-button'a otomatik tıklama
      if (e.type === 'mousedown' || e.type === 'touchstart') {
        var startButton = document.getElementById('start-button');
        if (startButton && startButton.style.display !== 'none' && !window.unityStarted) {
          setTimeout(function() {
            startButton.click();
          }, 100);
        }
      }
    }
    
    interactionEvents.forEach(function(eventType) {
      document.addEventListener(eventType, handleInteraction, { once: false });
    });
    
    // Sayfa tam yüklendiğinde otomatik olarak çağır
    if (document.readyState === 'complete') {
      window.fixWebGLErrors();
      fixSafariIssues();
    } else {
      window.addEventListener('load', function() {
        window.fixWebGLErrors();
        fixSafariIssues();
      });
    }
  }
  
  // Sayfa yüklendiğinde dinleyicileri ekle
  document.addEventListener('DOMContentLoaded', addInputListeners);
})(); 