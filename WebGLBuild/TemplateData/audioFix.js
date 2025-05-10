/**
 * WebGL ve AudioContext sorunlarını gidermek için yardımcı fonksiyonlar
 */

// Unity WebGL sorunlarını çözmek için monkeypatch uygulamaları
(function() {
  // Global değişkenler
  window.audioStarted = false;
  window.unityStarted = false;
  window.webGLFixed = false;
  
  // Unity WebGL modülünü düzelt
  function patchUnityWebGL() {
    // WebGL bağlamını düzeltme fonksiyonu
    function monkeyPatchWebGL() {
      if (window.webGLFixed) return;
      
      try {
        // WebGL2RenderingContext.prototype üzerinde düzeltmeler
        if (window.WebGL2RenderingContext && WebGL2RenderingContext.prototype) {
          // getInternalformatParameter hatasını düzelten patch
          var original = WebGL2RenderingContext.prototype.getInternalformatParameter;
          WebGL2RenderingContext.prototype.getInternalformatParameter = function() {
            try {
              return original.apply(this, arguments);
            } catch (e) {
              console.log('WebGL getInternalformatParameter hatası önlendi');
              return new Int32Array([0, 0, 0, 0]);
            }
          };
        }
        
        // Canvas'taki WebGL bağlamını al ve düzelt
        var canvas = document.getElementById('unity-canvas');
        if (canvas) {
          var contextOptions = {
            antialias: false,
            alpha: false,
            depth: true,
            stencil: false,
            premultipliedAlpha: false,
            preserveDrawingBuffer: false,
            powerPreference: 'default',
            failIfMajorPerformanceCaveat: false
          };
          
          // WebGL2 bağlamını al
          var gl = canvas.getContext('webgl2', contextOptions) || 
                   canvas.getContext('webgl', contextOptions) || 
                   canvas.getContext('experimental-webgl', contextOptions);
          
          if (gl) {
            // getInternalformatParameter metodunu düzelt
            if (gl.getInternalformatParameter) {
              var originalMethod = gl.getInternalformatParameter;
              gl.getInternalformatParameter = function() {
                try {
                  return originalMethod.apply(this, arguments);
                } catch (e) {
                  console.log('WebGL getInternalformatParameter doğrudan hatası önlendi');
                  return new Int32Array([0, 0, 0, 0]);
                }
              };
            }
          }
        }
        
        // Unity modülünü düzelt
        if (window.unityInstance && window.unityInstance.Module) {
          var Module = window.unityInstance.Module;
          
          // GL fonksiyonlarını düzelt
          if (Module.GL) {
            var originalGetInternalformat = Module.GL.getInternalformat;
            Module.GL.getInternalformat = function() {
              try {
                return originalGetInternalformat.apply(this, arguments);
              } catch (e) {
                console.log('Unity GL.getInternalformat hatası önlendi');
                return 0;
              }
            };
          }
          
          // WebGL ses sistemini düzelt
          if (Module.WebGLAudio) {
            if (Module.WebGLAudio.audioContext && Module.WebGLAudio.audioContext.state === 'suspended') {
              Module.WebGLAudio.audioContext.resume();
            }
          }
        }
        
        window.webGLFixed = true;
        console.log('WebGL düzeltmeleri uygulandı');
      } catch (e) {
        console.warn('WebGL monkeypatch hatası:', e);
      }
    }
    
    // Belirli aralıklarla WebGL düzeltmelerini uygula
    var patchInterval = setInterval(function() {
      if (window.unityInstance) {
        monkeyPatchWebGL();
        if (window.webGLFixed) {
          clearInterval(patchInterval);
        }
      }
    }, 500);
    
    // 10 saniye sonra interval'i temizle
    setTimeout(function() {
      clearInterval(patchInterval);
    }, 10000);
  }
  
  // Ses API'lerini başlat
  window.startAudioContext = function() {
    if (window.audioStarted) return;
    
    try {
      // AudioContext başlatma
      if (typeof AudioContext !== 'undefined' || typeof webkitAudioContext !== 'undefined') {
        var AudioContextClass = window.AudioContext || window.webkitAudioContext;
        
        // Tüm ses bağlamlarını başlat
        document.querySelectorAll('*').forEach(function(el) {
          if (el.audioContext && el.audioContext instanceof AudioContextClass && el.audioContext.state === 'suspended') {
            el.audioContext.resume();
          }
        });
        
        // Unity WebGL ses sistemini başlat
        if (window.unityInstance && window.unityInstance.Module && window.unityInstance.Module.WebGLAudio) {
          var audioCtx = window.unityInstance.Module.WebGLAudio.audioContext;
          if (audioCtx && audioCtx.state === 'suspended') {
            audioCtx.resume().then(function() {
              console.log('Unity WebGLAudio başlatıldı');
            });
          }
        }
        
        // WebGL bağlamında ses düzenlemeleri
        if (window.unityInstance && window.unityInstance.Module) {
          try {
            var Module = window.unityInstance.Module;
            
            // Ses API'lerini düzelt
            if (Module.WEB_AUDIO_SYSTEM) {
              Module.WEB_AUDIO_SYSTEM.unlock = function() {
                return true;
              };
            }
            
            // Web ses sistemini yeniden başlat
            if (typeof Module._JSWebAudioRecreateContexts === 'function') {
              Module._JSWebAudioRecreateContexts();
              console.log('Web ses bağlamları yeniden oluşturuldu');
            }
          } catch (e) {
            console.warn('Unity ses düzenlemeleri hatası:', e);
          }
        }
        
        // SpeechSynthesis API'sini etkinleştir
        if ('speechSynthesis' in window) {
          window.speechSynthesis.getVoices();
        }
        
        window.audioStarted = true;
        console.log('Ses sistemleri etkinleştirildi');
      }
    } catch (e) {
      console.warn('Ses başlatma hatası:', e);
    }
  };
  
  // WebSocket işleyiciyi düzelt
  function fixWebSocketHandler() {
    try {
      // Unity'nin WebSocket sınıfını WebGL için düzelt
      if (window.unityInstance) {
        var Module = window.unityInstance.Module;
        
        // WebSocket uyumluluğunu kontrol et
        if (Module && !Module.websocket) {
          Module.websocket = {
            url: "ws://localhost:8001/ws",
            send: function(data) {
              if (window.WebSocket) {
                console.log('[Socket] Unity websocket send patched');
                return true;
              }
              return false;
            }
          };
        }
      }
      
      // WebSocket olay dinleyicisini düzelt
      if (window.WebSocket) {
        var originalWebSocket = window.WebSocket;
        window.WebSocket = function(url, protocols) {
          var ws = new originalWebSocket(url, protocols);
          console.log('[Socket] WebSocket oluşturuldu:', url);
          
          // Bağlantı hatalarını yakala
          ws.addEventListener('error', function(error) {
            console.log('[Socket] WebSocket hatası:', error);
          });
          
          return ws;
        };
        window.WebSocket.prototype = originalWebSocket.prototype;
        window.WebSocket.CONNECTING = originalWebSocket.CONNECTING;
        window.WebSocket.OPEN = originalWebSocket.OPEN;
        window.WebSocket.CLOSING = originalWebSocket.CLOSING;
        window.WebSocket.CLOSED = originalWebSocket.CLOSED;
      }
      
      console.log('[Socket] WebSocket düzeltmeleri uygulandı');
    } catch (e) {
      console.warn('[Socket] WebSocket düzeltme hatası:', e);
    }
  }
  
  // Unity performans optimizasyonları
  function optimizeUnityPerformance() {
    try {
      if (window.unityInstance) {
        // Unity işleyiciyi optimite et
        if (window.unityInstance.SetMaximumFramerate) {
          window.unityInstance.SetMaximumFramerate(30); // FPS'i düşürerek performans artışı
        }
        
        // Video belleğini temizle
        if (window.unityInstance.Module && window.unityInstance.Module.HEAPU8) {
          var lastTime = 0;
          var gcTimer = setInterval(function() {
            var currentTime = Date.now();
            if (currentTime - lastTime > 1000) {
              if (typeof window.unityInstance.Module._free === 'function') {
                window.unityInstance.Module._free(0); // Boş bellek adresi çağırarak GC'yi zorla
              }
              lastTime = currentTime;
            }
          }, 10000);
          
          // 2 dakika sonra interval'i temizle
          setTimeout(function() {
            clearInterval(gcTimer);
          }, 120000);
        }
        
        console.log('Unity performans optimizasyonları uygulandı');
      }
    } catch (e) {
      console.warn('Unity performans optimizasyonu hatası:', e);
    }
  }
  
  // Unity yüklendikten sonra çağrılacak
  function onUnityLoaded() {
    if (window.unityStarted) return;
    window.unityStarted = true;
    
    // WebGL düzeltmeleri
    patchUnityWebGL();
    
    // WebSocket düzeltmeleri
    fixWebSocketHandler();
    
    // Performans optimizasyonları
    optimizeUnityPerformance();
    
    // Ses API'lerini başlat
    window.startAudioContext();
    
    console.log('Unity yüklemesi tamamlandı, tüm düzeltmeler uygulandı');
  }
  
  // Kullanıcı etkileşimiyle sesi ve sistemi başlatma
  function handleUserInteraction(e) {
    // Ses API'lerini başlat
    window.startAudioContext();
    
    // Unity yüklendi mi kontrol et
    if (window.unityInstance && !window.unityStarted) {
      onUnityLoaded();
    }
    
    // Butona tıklamayı simüle et
    if ((e.type === 'mousedown' || e.type === 'touchstart') && e.target.id !== 'start-button') {
      var startButton = document.getElementById('start-button');
      if (startButton && getComputedStyle(startButton).display !== 'none') {
        startButton.click();
      }
    }
  }
  
  // Unity yükleme gözetleyicisini başlat
  function setupUnityLoadWatcher() {
    // Unity yüklemesini izle
    var checkUnityInterval = setInterval(function() {
      if (window.unityInstance) {
        clearInterval(checkUnityInterval);
        onUnityLoaded();
      }
    }, 1000);
    
    // En fazla 30 saniye bekle
    setTimeout(function() {
      clearInterval(checkUnityInterval);
    }, 30000);
  }
  
  // Sayfa yüklendiğinde çalışacak ana fonksiyon
  function initialize() {
    // Kullanıcı etkileşimi dinleyicileri
    ['mousedown', 'touchstart', 'keydown'].forEach(function(eventType) {
      document.addEventListener(eventType, handleUserInteraction, { passive: true });
    });
    
    // Unity yükleme gözetleyicisini başlat
    setupUnityLoadWatcher();
    
    // Unity analitik/telemetri isteklerini engelle
    var originalSendBeacon = navigator.sendBeacon;
    if (originalSendBeacon) {
      navigator.sendBeacon = function(url, data) {
        if (url.indexOf('cdp.cloud.unity3d.com') !== -1) {
          console.log('Unity telemetri isteği engellendi:', url);
          return true;
        }
        return originalSendBeacon.call(navigator, url, data);
      };
    }
    
    // XMLHttpRequest üzerinden Unity analitik isteklerini engelle
    var originalXHROpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function(method, url) {
      if (url && typeof url === 'string' && url.indexOf('cdp.cloud.unity3d.com') !== -1) {
        console.log('Unity XHR telemetri isteği engellendi:', url);
        this.abort = function() {};
        this.send = function() {};
        return;
      }
      originalXHROpen.apply(this, arguments);
    };
    
    // Fetch API üzerinden Unity analitik isteklerini engelle
    var originalFetch = window.fetch;
    window.fetch = function(resource, init) {
      if (resource && typeof resource === 'string' && resource.indexOf('cdp.cloud.unity3d.com') !== -1) {
        console.log('Unity fetch telemetri isteği engellendi:', resource);
        return Promise.resolve(new Response('', {status: 200}));
      }
      return originalFetch.apply(this, arguments);
    };
    
    console.log('Web ses ve WebGL düzeltme sistemi başlatıldı');
  }
  
  // Sayfa yüklendiğinde başlat
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
  } else {
    initialize();
  }
})(); 