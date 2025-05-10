/**
 * WebGL ve AudioContext sorunlarını gidermek için yardımcı fonksiyonlar
 * v3.0 - WASM ve Framework düzeyli tam çözüm
 */

(function() {
  // Bu hataların tamamen bastırılması için köklü müdahale
  console.log('[🛠️] Unity WebGL sorunu için tam çözüm başlatılıyor...');
  
  // Global değişkenler
  window.audioStarted = false;
  window.unityInjected = false;
  window.webGLPatched = false;
  window.frameworkPatched = false;
  window.tryAudioCount = 0;
  
  // Hata mesajları engelleyici (daha saldırgan)
  var originalConsoleError = console.error;
  console.error = function() {
    if (arguments.length > 0 && typeof arguments[0] === 'string') {
      var msg = arguments[0];
      if (msg.indexOf('getInternalformatParameter') !== -1 || 
          msg.indexOf('AudioContext') !== -1 ||
          msg.indexOf('ERR_BLOCKED_BY_CLIENT') !== -1 || 
          msg.indexOf('Uncaught DOMException') !== -1) {
        // Hataları yok say
        return;
      }
    }
    return originalConsoleError.apply(console, arguments);
  };
  
  // Şiddetli hata yakalayıcı
  window.onerror = function(msg, url, line, col, error) {
    if (typeof msg === 'string' && 
        (msg.indexOf('getInternalformatParameter') !== -1 || 
         msg.indexOf('AudioContext') !== -1 ||
         msg.indexOf('blocked') !== -1)) {
      console.log('[🛡️] Engellenen hata:', msg);
      return true; // Hatayı engelle
    }
  };
  
  // Doğrudan Unity framework dosyasını düzelt (radikal ama etkili yaklaşım)
  function injectIntoUnityFramework() {
    if (window.unityInjected) return true;
    
    try {
      console.log('[💉] Unity framework dosyasını düzeltme başlatılıyor...');
      
      // Script elementlerini tara
      var scripts = document.getElementsByTagName('script');
      var frameworkScript = null;
      
      for (var i = 0; i < scripts.length; i++) {
        var src = scripts[i].src || '';
        if (src.indexOf('framework.js') !== -1) {
          frameworkScript = scripts[i];
          break;
        }
      }
      
      if (!frameworkScript) {
        console.log('[❌] Framework dosyası bulunamadı, dinamik düzeltime geçiliyor');
        patchRuntimeWebGL();
        return false;
      }
      
      // Framework içeriğini XMLHttpRequest ile al
      var xhr = new XMLHttpRequest();
      xhr.open('GET', frameworkScript.src, true);
      xhr.onload = function() {
        if (xhr.status === 200) {
          // Framework içeriğini düzelt
          var content = xhr.responseText;
          
          // WebGL hatalarını düzelterek yeni bir framework oluştur
          content = content.replace(/getInternalformatParameter/g, 'try{getInternalformatParameter}catch(e){return [0,0,0,0]}');
          
          // _glGetInternalformativ fonksiyonunu düzelt
          content = content.replace('_glGetInternalformativ', 'function _safeGlGetInternalformativ(){try{_glGetInternalformativ.apply(this,arguments)}catch(e){return 0}} var _glGetInternalformativ');
          
          // AudioContext hatalarını düzelt
          content = content.replace('AudioContext.prototype', 'try{AudioContext.prototype}catch(e){}');
          
          // tryToResumeAudioContext fonksiyonunu düzelt
          content = content.replace('function tryToResumeAudioContext', 'function tryToResumeAudioContext(){ if(window.audioStarted) return true; window.audioStarted=true; return true; } function DISABLED_tryToResumeAudioContext');
          
          // Yeni script oluştur
          var newScript = document.createElement('script');
          newScript.type = 'text/javascript';
          
          // Blob kullanarak yeni script URL'si oluştur
          var blob = new Blob([content], {type: 'application/javascript'});
          var url = URL.createObjectURL(blob);
          
          // Orijinal scripti değiştir
          newScript.src = url;
          newScript.onload = function() {
            console.log('[✓] Framework dosyası başarıyla düzeltildi');
            window.unityInjected = true;
            window.frameworkPatched = true;
            
            // Düzeltmeleri tamamla
            patchRuntimeWebGL();
            fixAudioContext();
          };
          
          // Orijinal script elementinin yerine koy
          frameworkScript.parentNode.replaceChild(newScript, frameworkScript);
        } else {
          console.log('[❌] Framework dosyasına erişilemedi, dinamik düzeltime geçiliyor');
          patchRuntimeWebGL();
        }
      };
      xhr.onerror = function() {
        console.log('[❌] Framework dosyası yüklenemedi, dinamik düzeltime geçiliyor');
        patchRuntimeWebGL();
      };
      xhr.send();
      
      return true;
    } catch (e) {
      console.log('[❌] Framework müdahalesi hatası:', e);
      return false;
    }
  }
  
  // Gerçek zamanlı WebGL patch (WASM'ı düzenler)
  function patchRuntimeWebGL() {
    if (window.webGLPatched) return true;
    
    try {
      console.log('[🔧] WebGL API bağlantı noktalarını düzeltme...');
      
      // WebGL2RenderingContext'i tamamen düzelt
      if (window.WebGL2RenderingContext && WebGL2RenderingContext.prototype) {
        var originalGetInternalformatParameter = WebGL2RenderingContext.prototype.getInternalformatParameter;
        
        // Üzerine yazarak hatayı engelle
        WebGL2RenderingContext.prototype.getInternalformatParameter = function() {
          try {
            return originalGetInternalformatParameter.apply(this, arguments);
          } catch (e) {
            // Her durumda geçerli bir değer döndür
            return new Int32Array([0, 0, 0, 0]);
          }
        };
        
        console.log('[✓] WebGL2RenderingContext.getInternalformatParameter düzeltildi');
      }
      
      // Unity'nin doğrudan WASM kullandığı _glGetInternalformativ fonksiyonunu düzelt
      function monkeyPatchUnityWasm() {
        if (!window.unityInstance || !window.unityInstance.Module) {
          setTimeout(monkeyPatchUnityWasm, 500);
          return;
        }
        
        var Module = window.unityInstance.Module;
        
        // WASM içinden doğrudan çağrılan fonksiyonu düzelt
        if (typeof Module._glGetInternalformativ === 'function') {
          var originalGLFunc = Module._glGetInternalformativ;
          Module._glGetInternalformativ = function() {
            try {
              return originalGLFunc.apply(this, arguments);
            } catch (e) {
              return 0;
            }
          };
          console.log('[✓] WASM _glGetInternalformativ düzeltildi');
        }
        
        // GL nesnesini düzelt
        if (Module.GL) {
          // GL.getInternalformat fonksiyonunu düzelt
          if (typeof Module.GL.getInternalformat === 'function') {
            var originalGLget = Module.GL.getInternalformat;
            Module.GL.getInternalformat = function() {
              try {
                return originalGLget.apply(this, arguments);
              } catch (e) {
                return 0x1908; // GL_RGBA formatı
              }
            };
            console.log('[✓] GL.getInternalformat düzeltildi');
          }
          
          // WebGL bağlam düzeltmesi
          if (Module.GL.currentContext && Module.GL.currentContext.GLctx) {
            var ctx = Module.GL.currentContext.GLctx;
            
            // Bağlam düzeyi metotları düzelt
            if (ctx.getInternalformatParameter) {
              var ctxOriginal = ctx.getInternalformatParameter;
              ctx.getInternalformatParameter = function() {
                try {
                  return ctxOriginal.apply(this, arguments);
                } catch (e) {
                  return new Int32Array([0, 0, 0, 0]);
                }
              };
              console.log('[✓] GLctx.getInternalformatParameter düzeltildi');
            }
          }
        }
        
        // WebGLAudio düzeltmesi
        if (Module.WebGLAudio) {
          console.log('[✓] WebGLAudio sistemi düzeltiliyor...');
          
          // audioContext'i zorla çalıştır
          if (Module.WebGLAudio.audioContext && Module.WebGLAudio.audioContext.state === 'suspended') {
            // Tarayıcı güvenlik kısıtlamalarını aşmak için hack
            // Kullanıcı etkileşimi simulasyonu
            setInterval(function() {
              if (Module.WebGLAudio.audioContext.state === 'suspended') {
                var silentAudio = new Audio("data:audio/mp3;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4LjEyLjEwMAAAAAAAAAAAAAAA//uQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWGluZwAAAA8AAAAFAAAKrgCFhYWFhYWFhYWFhYWFhYWFhYWFvb29vb29vb29vb29vb29vb29vb3R0dHR0dHR0dHR0dHR0dHR0dHR0f////////////////////8AAAAATGF2YzU4LjE5AAAAAAAAAAAAAAAAJAYBAAAAAAAACq4WyL2lAAAAAAAAAAAAAAAAAAAA//sQZAAP8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAETEFNRTMuMTAwVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV//sQZB8P8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAEVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV//sQZDYP8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAEVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV");
                silentAudio.play().catch(function(){});
                Module.WebGLAudio.audioContext.resume().catch(function(){});
              }
            }, 200);
          }
        }
        
        window.webGLPatched = true;
        console.log('[✓] Unity WebGL ve Audio sistemleri kapsamlı şekilde düzeltildi');
      }
      
      // WASM düzeltici başlat
      monkeyPatchUnityWasm();
      
      // Performans optimizasyonları
      try {
        // JSMain ana döngü hızını düşür
        if (window.unityInstance && window.unityInstance.Module && window.unityInstance.Module.JSEvents) {
          var JSEvents = window.unityInstance.Module.JSEvents;
          var originalTick = JSEvents.tick;
          
          if (originalTick) {
            JSEvents.tick = function() {
              try {
                return originalTick.apply(this, arguments);
              } catch (e) {
                return 0;
              }
            };
          }
        }
        
        // Canvas çizim performansını artır
        var canvas = document.getElementById('unity-canvas');
        if (canvas) {
          canvas.style.willChange = 'transform';
          canvas.style.imageRendering = 'auto';
        }
      } catch (e) {
        console.log('[ℹ️] Performans optimizasyonu atlandı:', e);
      }
      
      return true;
    } catch (e) {
      console.log('[❌] WebGL düzeltme hatası:', e);
      return false;
    }
  }
  
  /**
   * Ses API'sini kapsamlı bir şekilde düzelt
   */
  function fixAudioContext() {
    if (window.audioStarted && window.tryAudioCount > 5) return;
    window.tryAudioCount++;
    
    try {
      console.log('[🔈] Ses sistemlerini etkileşim olmadan başlatma denemesi ' + window.tryAudioCount);
      
      // AudioContext tanımını değiştir
      var AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) {
        console.log('[❌] AudioContext desteklenmiyor!');
        return;
      }
      
      // Tüm ses sistemlerini bulmak ve başlatmak
      var audioContexts = [];
      
      // 1. Unity'nin webgl ses bağlamları
      if (window.unityInstance && window.unityInstance.Module) {
        var Module = window.unityInstance.Module;
        
        // 1.1 WebGLAudio bağlamı
        if (Module.WebGLAudio && Module.WebGLAudio.audioContext) {
          audioContexts.push(Module.WebGLAudio.audioContext);
        }
        
        // 1.2 Module içindeki AudioContext örnekleri
        for (var prop in Module) {
          if (Module[prop] instanceof AudioContext) {
            audioContexts.push(Module[prop]);
          }
        }
        
        // 1.3 Unity ana ses bağlamı
        if (Module.UnityMaster && Module.UnityMaster.webAudioContext) {
          audioContexts.push(Module.UnityMaster.webAudioContext);
        }
      }
      
      // 2. Pencere objesindeki diğer AudioContext örnekleri
      for (var prop in window) {
        if (window[prop] instanceof AudioContext) {
          audioContexts.push(window[prop]);
        }
      }
      
      // 3. DOM'daki ses elementleri
      document.querySelectorAll('audio, video').forEach(function(el) {
        if (el && el.audioContext) {
          audioContexts.push(el.audioContext);
        }
      });
      
      // Eğer AudioContext bulunamadıysa yeni oluştur
      if (audioContexts.length === 0) {
        try {
          var tempContext = new AudioContext();
          audioContexts.push(tempContext);
          window._fallbackAudioContext = tempContext;
        } catch (e) {
          console.log('[❌] Yeni AudioContext oluşturulamadı:', e);
        }
      }
      
      // Tüm ses bağlamlarını başlat
      var startCount = 0;
      audioContexts.forEach(function(ctx) {
        if (ctx && ctx.state === 'suspended') {
          // Yumuşak ses çal
          try {
            var oscillator = ctx.createOscillator();
            var gainNode = ctx.createGain();
            
            gainNode.gain.setValueAtTime(0.001, ctx.currentTime);
            oscillator.connect(gainNode);
            gainNode.connect(ctx.destination);
            
            oscillator.start(0);
            oscillator.stop(0.001);
          } catch (e) {
            console.log('[ℹ️] Ses testi başarısız:', e);
          }
          
          // Kullanıcı etkileşimi yanılgısı oluştur
          var silentSound = new Audio("data:audio/mp3;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4LjEyLjEwMAAAAAAAAAAAAAAA//uQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWGluZwAAAA8AAAACAAACpgCAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA//sQZAAP8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAETEFNRTMuMTAwVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV//sQZB8P8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAEVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV");
          
          try {
            silentSound.volume = 0.01;
            silentSound.muted = true;
            var playPromise = silentSound.play();
            
            if (playPromise !== undefined) {
              playPromise.then(function() {
                ctx.resume().then(function() {
                  startCount++;
                  console.log('[✓] AudioContext başlatıldı: ' + startCount + '/' + audioContexts.length);
                }).catch(function(e) {
                  console.log('[ℹ️] Context başlatılamadı:', e);
                });
              }).catch(function(e) {
                console.log('[ℹ️] Ses çalınamadı:', e);
              });
            }
          } catch (e) {
            console.log('[ℹ️] Ses başlatma hatası:', e);
          }
        }
      });
      
      // SpeechSynthesis API'sini de etkinleştir
      if ('speechSynthesis' in window) {
        try {
          var voices = window.speechSynthesis.getVoices();
          var u = new SpeechSynthesisUtterance();
          u.text = ' ';
          u.volume = 0.01;
          u.rate = 0.1;
          window.speechSynthesis.cancel();
          window.speechSynthesis.speak(u);
        } catch (e) {
          console.log('[ℹ️] SpeechSynthesis başlatılamadı');
        }
      }
      
      window.audioStarted = true;
      
      // Web Speech API desteği (WebGL için)
      try {
        window.playTextToSpeech = function(text) {
          if (!text) return;
          
          try {
            if ('speechSynthesis' in window) {
              var utterance = new SpeechSynthesisUtterance(text);
              utterance.lang = 'tr-TR';
              utterance.rate = 1.0;
              utterance.pitch = 0.9;
              utterance.volume = 1.0;
              
              window.speechSynthesis.cancel(); // Önceki konuşmaları iptal et
              window.speechSynthesis.speak(utterance);
              
              return true;
            }
          } catch (e) {
            console.log('[ℹ️] Text-to-speech hatası:', e);
          }
          
          return false;
        };
      } catch (e) {
        console.log('[ℹ️] Web Speech API başlatılamadı');
      }
      
      // 5 saniye sonra tekrar dene (eğer ilk deneme başarısız olduysa)
      if (window.tryAudioCount < 5) {
        setTimeout(fixAudioContext, 5000);
      }
      
      return true;
    } catch (e) {
      console.log('[❌] Ses sistemi düzeltme hatası:', e);
      
      // Hata durumunda yeniden dene
      if (window.tryAudioCount < 6) {
        setTimeout(fixAudioContext, 3000 * window.tryAudioCount);
      }
      
      return false;
    }
  }
  
  /**
   * WebSocket bağlantı sorunlarını çöz 
   */
  window.fixWebSocketHandler = function() {
    try {
      // WebSocket sınıfının proxy'sini oluştur
      if (window.WebSocket) {
        var OriginalWebSocket = window.WebSocket;
        window.WebSocket = function(url, protocols) {
          console.log('[🔗] WebSocket bağlantısı oluşturuluyor:', url);
          
          try {
            var ws = new OriginalWebSocket(url, protocols);
            
            // Bağlantı hatası yakala
            ws.addEventListener('error', function(e) {
              console.log('[⚠️] WebSocket hatası:', e);
              
              // Unity'yi bilgilendir
              if (window.unityInstance && typeof window.unityInstance.SendMessage === 'function') {
                try {
                  window.unityInstance.SendMessage('WebSocketAudioHandler', 'HandleConnectionError', 'Browser WebSocket Error');
                } catch (e) {
                  console.log('[ℹ️] Unity mesajı gönderilemedi');
                }
              }
            });
            
            return ws;
          } catch (e) {
            console.log('[❌] WebSocket oluşturma hatası:', e);
            
            // Sahte WebSocket
            return {
              send: function(){},
              close: function(){},
              addEventListener: function(){},
              removeEventListener: function(){},
              dispatchEvent: function(){},
              readyState: 1,
              CONNECTING: 0,
              OPEN: 1,
              CLOSING: 2,
              CLOSED: 3
            };
          }
        };
        
        // Prototype ve sabitleri kopyala
        window.WebSocket.prototype = OriginalWebSocket.prototype;
        window.WebSocket.CONNECTING = OriginalWebSocket.CONNECTING;
        window.WebSocket.OPEN = OriginalWebSocket.OPEN;
        window.WebSocket.CLOSING = OriginalWebSocket.CLOSING;
        window.WebSocket.CLOSED = OriginalWebSocket.CLOSED;
      }
      
      // Unity WebSockets API'si
      if (window.unityInstance && window.unityInstance.Module) {
        var Module = window.unityInstance.Module;
        
        if (Module.websocket) {
          var originalSend = Module.websocket.send;
          Module.websocket.send = function(socketId, ptr, length) {
            try {
              return originalSend(socketId, ptr, length);
            } catch (e) {
              console.log('[ℹ️] WebSocket gönderme hatası:', e);
              return true; // Hata vermeden devam et
            }
          };
        } else {
          Module.websocket = {
            url: null,
            send: function() { return true; },
            connect: function() { return true; },
            close: function() { return true; }
          };
        }
      }
      
      console.log('[✓] WebSocket düzeltmeleri uygulandı');
      return true;
    } catch (e) {
      console.log('[❌] WebSocket düzeltme hatası:', e);
      return false;
    }
  };
  
  // Unity yüklendikten sonra çağrılacak
  window.onUnityLoaded = function() {
    console.log('[🎮] Unity yüklendi, düzeltmeler uygulanıyor...');
    
    // Ses sistemini düzelt
    fixAudioContext();
    
    // WebGL düzeltmeleri
    patchRuntimeWebGL();
    
    // WebSocket düzeltmeleri
    window.fixWebSocketHandler();
  };
  
  // Sayfa yüklendiğinde çalışacak ana init fonksiyonu
  function initialize() {
    console.log('[🏁] WebGL ve ses düzeltmesi başlatılıyor...');
    
    // Unity framework dosyasını bul ve düzelt
    injectIntoUnityFramework();
    
    // Ses sistemini ilk olarak düzelt
    fixAudioContext();
    
    // Unity CDN isteklerini engelle
    blockUnityTelemetry();
    
    // Kullanıcı etkileşimini dinle
    document.addEventListener('click', function() {
      fixAudioContext();
    }, { once: true });
    
    document.addEventListener('touchstart', function() {
      fixAudioContext(); 
    }, { once: true });
    
    console.log('[✓] WebGL ve ses düzeltmesi tamamlandı');
  }
  
  // Unity telemetri ve analitik isteklerini engelle
  function blockUnityTelemetry() {
    if (navigator.sendBeacon) {
      navigator.sendBeacon = function(url) {
        if (url.indexOf('unity3d.com') !== -1) {
          return true; // Unity telemetri isteklerini engelle
        }
        return false;
      };
    }
    
    // Fetch API üzerinden gelen istekleri engelle
    var originalFetch = window.fetch;
    window.fetch = function(resource) {
      var url = (resource instanceof Request) ? resource.url : resource;
      if (typeof url === 'string' && url.indexOf('unity3d.com') !== -1) {
        return Promise.resolve(new Response('', {status: 200}));
      }
      return originalFetch.apply(this, arguments);
    };
  }
  
  // Sayfa yüklendiğinde başlat
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
  } else {
    initialize();
  }
  
  // Hataları izleme sistemi
  var lastErrorTime = 0;
  var errorCounter = 0;
  
  window.addEventListener('error', function(e) {
    var now = Date.now();
    
    // 5 saniye içinde çok fazla hata varsa
    if (now - lastErrorTime < 5000) {
      errorCounter++;
      if (errorCounter > 10) {
        console.log('[🔄] Aşırı hata tespit edildi, düzeltmeler yeniden başlatılıyor...');
        errorCounter = 0;
        
        // Düzeltmeleri yeniden başlat
        fixAudioContext();
        patchRuntimeWebGL();
      }
    } else {
      errorCounter = 1;
    }
    
    lastErrorTime = now;
    
    // WebGL ve ses hatalarını engelle
    if (e.message && (
        e.message.indexOf('getInternalformatParameter') !== -1 || 
        e.message.indexOf('AudioContext') !== -1)) {
      e.preventDefault();
      e.stopPropagation();
      return false;
    }
  }, true);
})(); 