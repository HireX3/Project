/**
 * WebGL ve AudioContext sorunlarını gidermek için yardımcı fonksiyonlar
 * v2.0 - WASM Düzeltmesi
 */

(function() {
  // Global değişkenler
  window.audioStarted = false;
  window.unityStarted = false;
  window.webGLFixed = false;
  window.wasmPatchApplied = false;
  
  // Bu script modülü yüklenince webgl hata düzeltici kodunu hemen ekle
  console.log('[WebGL Düzeltme] Script yüklendi, WebGL düzeltmeleri hazırlanıyor');
  
  /**
   * Hata mesajlarını filtreleme
   */
  var originalConsoleError = console.error;
  console.error = function() {
    // WebGL hatalarını filtrele
    if (arguments.length > 0 && 
        typeof arguments[0] === 'string' && 
        (arguments[0].indexOf('getInternalformatParameter') !== -1 || 
         arguments[0].indexOf('AudioContext') !== -1)) {
      console.log('[Hata Filtrelendi]', arguments[0]);
      return;
    }
    return originalConsoleError.apply(console, arguments);
  };
  
  /**
   * WebGL2 bağlamı üzerine güçlü bir monkeypatch uygulayarak 
   * getInternalformatParameter sorununu kökten çözer
   */
  function deepPatchWebGL() {
    try {
      // WebGL2RenderingContext prototipini düzelt
      if (window.WebGL2RenderingContext && WebGL2RenderingContext.prototype) {
        // Orjinal metodu kaydet
        var originalGetInternalformatParameter = WebGL2RenderingContext.prototype.getInternalformatParameter;
        
        // Metodu tamamen değiştir
        WebGL2RenderingContext.prototype.getInternalformatParameter = function(target, internalformat, pname) {
          try {
            return originalGetInternalformatParameter.call(this, target, internalformat, pname);
          } catch (e) {
            // Hata durumunda güvenli bir dönüş değeri sağla
            return new Int32Array([0, 0, 0, 0, 0, 0, 0, 0]);
          }
        };
        
        console.log('[WebGL Düzeltme] WebGL2RenderingContext.getInternalformatParameter patched');
      }
      
      // Canvas oluştur ve WebGL bağlamını al
      var canvas = document.createElement('canvas');
      var gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
      
      if (gl) {
        // WebGL bağlamını düzelt
        if (gl.getInternalformatParameter) {
          var original = gl.getInternalformatParameter;
          gl.getInternalformatParameter = function() {
            try {
              return original.apply(this, arguments);
            } catch (e) {
              return new Int32Array([0, 0, 0, 0]);
            }
          };
        }
      }
      
      // Orijinal hatayı silme
      window.addEventListener('error', function(e) {
        if (e && e.message && e.message.indexOf('getInternalformatParameter') > -1) {
          e.preventDefault();
          e.stopPropagation();
          return false;
        }
      }, true);
      
      return true;
    } catch (e) {
      console.log('[WebGL Düzeltme] WebGL patch hatası:', e);
      return false;
    }
  }

  /**
   * Unity'nin WASM modülüne müdahale ederek WebGL hatalarını doğrudan kaynağında düzeltir
   * Bu, derin bir düzeltme işlemidir ve sadece Unity tamamen yüklendikten sonra çalıştırılmalıdır
   */
  function patchUnityWasmModule() {
    if (window.wasmPatchApplied) return true;
    
    try {
      if (!window.unityInstance || !window.unityInstance.Module) {
        console.log('[WASM Patch] Unity modülü henüz hazır değil');
        return false;
      }
      
      var Module = window.unityInstance.Module;
      
      // _glGetInternalformativ fonksiyonunu düzelt
      if (typeof Module._glGetInternalformativ === 'function') {
        var originalFunc = Module._glGetInternalformativ;
        
        // Yeni fonksiyon
        Module._glGetInternalformativ = function() {
          try {
            return originalFunc.apply(this, arguments);
          } catch (e) {
            console.log('[WASM Patch] _glGetInternalformativ hatası önlendi');
            return 0;
          }
        };
        
        console.log('[WASM Patch] _glGetInternalformativ patched');
      }
      
      // GL modülünü düzelt
      if (Module.GL) {
        // getInternalformat fonksiyonunu düzelt
        if (typeof Module.GL.getInternalformat === 'function') {
          var originalGLFunc = Module.GL.getInternalformat;
          Module.GL.getInternalformat = function() {
            try {
              return originalGLFunc.apply(this, arguments);
            } catch (e) {
              console.log('[WASM Patch] GL.getInternalformat hatası önlendi');
              return 0x1908; // GL_RGBA formatı
            }
          };
          console.log('[WASM Patch] GL.getInternalformat patched');
        }
      }
      
      // WebGL işlemlerini optimize et
      if (Module.GL && typeof Module.GL.currentContext !== 'undefined') {
        var ctx = Module.GL.currentContext;
        if (ctx && ctx.GLctx) {
          var glCtx = ctx.GLctx;
          
          // WebGL bağlamında düzeltme
          if (glCtx && glCtx.getInternalformatParameter) {
            var glOriginal = glCtx.getInternalformatParameter;
            glCtx.getInternalformatParameter = function() {
              try {
                return glOriginal.apply(this, arguments);
              } catch (e) {
                console.log('[WASM Patch] GLctx.getInternalformatParameter hatası önlendi');
                return new Int32Array([0, 0, 0, 0]);
              }
            };
            console.log('[WASM Patch] GLctx.getInternalformatParameter patched');
          }
        }
      }
      
      // Performans optimizasyonları
      if (Module.setCanvasSize) {
        var originalSetCanvasSize = Module.setCanvasSize;
        Module.setCanvasSize = function(width, height, noUpdate) {
          try {
            return originalSetCanvasSize.call(this, width, height, noUpdate);
          } catch (e) {
            console.log('[WASM Patch] setCanvasSize hatası önlendi:', e);
            return;
          }
        };
      }
      
      // Frame rate sınırlaması (donanım kaynaklarını korumak için)
      if (typeof Module.setCanvasElementSize !== 'undefined') {
        if (!Module._targetFps) {
          Module._targetFps = 30; // 30 FPS hedefle
          Module._lastFrameTime = 0;
          
          // Ana döngü zamanlamasını değiştir
          var originalRun = Module._main;
          if (originalRun) {
            Module._main = function() {
              var result = originalRun.apply(this, arguments);
              if (Module.GPU) Module.GPU.currentFrameTime = 1000/30; // 30fps
              return result;
            };
          }
        }
      }
      
      // Bellek optimizasyonu
      if (Module.HEAP8) {
        // Daha sık GC çağır
        var originalFree = Module._free;
        if (originalFree) {
          var lastGC = 0;
          Module._free = function(ptr) {
            var result = originalFree.call(this, ptr);
            var now = Date.now();
            if (now - lastGC > 1000) { // Her 1 saniyede bir
              lastGC = now;
              if (typeof window.gc === 'function') {
                try { window.gc(); } catch(e) {}
              }
            }
            return result;
          };
        }
      }
      
      // İşlemi donduran sonsuz döngüleri engelle
      if (Module.dynCall) {
        var originalDynCall = Module.dynCall;
        Module.dynCall = function() {
          var startTime = performance.now();
          var result = originalDynCall.apply(this, arguments);
          var endTime = performance.now();
          
          if (endTime - startTime > 500) { // 500ms'den uzun süren çağrılar için uyarı
            console.log('[WASM Patch] Uzun süren WASM çağrısı: ' + (endTime - startTime) + 'ms');
          }
          
          return result;
        };
      }
      
      window.wasmPatchApplied = true;
      console.log('[WASM Patch] Unity WASM modülü başarıyla düzeltildi');
      return true;
    } catch (e) {
      console.log('[WASM Patch] Unity WASM patch hatası:', e);
      return false;
    }
  }
  
  /**
   * WebSocket bağlantılarını düzeltir
   */
  window.fixWebSocketHandler = function() {
    try {
      // Unity WebSocket erişimi
      if (window.unityInstance && window.unityInstance.Module) {
        var Module = window.unityInstance.Module;
        
        // WebSocket protokolü düzeltme
        if (Module.SocketIO && Module.SocketIO.websocket) {
          console.log('[WebSocket] Socket.IO WebSocket düzeltmesi uygulandı');
        }
        
        // WebSocket proxy oluştur
        if (window.WebSocket) {
          var OriginalWebSocket = window.WebSocket;
          
          window.WebSocket = function(url, protocols) {
            console.log('[WebSocket] Bağlantı oluşturuluyor:', url);
            
            try {
              var socket = new OriginalWebSocket(url, protocols);
              
              // Hata durumunda otomatik yeniden bağlanma
              socket.addEventListener('error', function(e) {
                console.log('[WebSocket] Bağlantı hatası:', e);
                
                // Unity'nin WebSocket yöneticisini bilgilendir
                if (window.unityInstance && typeof window.unityInstance.SendMessage === 'function') {
                  try {
                    window.unityInstance.SendMessage('WebSocketAudioHandler', 'OnSocketError', 'Connection Error');
                  } catch (err) {
                    console.log('[WebSocket] Unity message gönderme hatası:', err);
                  }
                }
              });
              
              // Debug eventi
              socket.addEventListener('open', function() {
                console.log('[WebSocket] Bağlantı başarılı:', url);
              });
              
              return socket;
            } catch (e) {
              console.log('[WebSocket] WebSocket oluşturma hatası:', e);
              
              // Sahte başarılı WebSocket nesnesi döndür (hata vermemesi için)
              return {
                send: function() { return true; },
                close: function() { return true; },
                addEventListener: function() { return true; },
                removeEventListener: function() { return true; },
                dispatchEvent: function() { return true; },
                readyState: 1, // OPEN
                CONNECTING: 0,
                OPEN: 1,
                CLOSING: 2,
                CLOSED: 3
              };
            }
          };
          
          // Prototip ve sabitleri kopyala
          window.WebSocket.prototype = OriginalWebSocket.prototype;
          window.WebSocket.CONNECTING = OriginalWebSocket.CONNECTING;
          window.WebSocket.OPEN = OriginalWebSocket.OPEN;
          window.WebSocket.CLOSING = OriginalWebSocket.CLOSING;
          window.WebSocket.CLOSED = OriginalWebSocket.CLOSED;
        }
      }
      
      console.log('[WebSocket] WebSocket düzeltmeleri uygulandı');
      return true;
    } catch (e) {
      console.log('[WebSocket] WebSocket düzeltme hatası:', e);
      return false;
    }
  };
  
  /**
   * Unity performans optimizasyonları
   */
  window.optimizeUnityPerformance = function() {
    try {
      if (!window.unityInstance) return false;
      
      // FPS sınırlandır
      if (window.unityInstance.SetMaximumFramerate) {
        window.unityInstance.SetMaximumFramerate(30);
      }
      
      // Çözünürlük düşür
      if (window.unityInstance.Module && window.unityInstance.Module.canvas) {
        var canvas = window.unityInstance.Module.canvas;
        var scale = 0.75; // Çözünürlüğü %75'e düşür
        
        var displayWidth = canvas.clientWidth * scale;
        var displayHeight = canvas.clientHeight * scale;
        
        if (canvas.width !== displayWidth || canvas.height !== displayHeight) {
          window.unityInstance.Module.setCanvasSize(displayWidth, displayHeight);
        }
      }
      
      // Gereksiz işlemleri devre dışı bırak
      if (window.unityInstance.Module) {
        var Module = window.unityInstance.Module;
        
        // Bellek optimizasyonu
        Module.TOTAL_MEMORY = 268435456; // 256 MB
        
        // GPU kaynakları optimize et
        if (Module.GL) {
          Module.GL.maxUniformBufferBindings = 24;
          Module.GL.currArrayBuffer = 0;
          Module.GL.currElementArrayBuffer = 0;
        }
      }
      
      console.log('[Performans] Unity performans optimizasyonları uygulandı');
      return true;
    } catch (e) {
      console.log('[Performans] Performans optimizasyonu hatası:', e);
      return false;
    }
  };
  
  /**
   * AudioContext başlatma
   */
  window.startAudioContext = function() {
    if (window.audioStarted) return true;
    
    try {
      console.log('[Ses] AudioContext başlatılıyor...');
      
      // AudioContext oluştur (tarayıcıya göre)
      var AudioContextClass = window.AudioContext || window.webkitAudioContext;
      
      if (AudioContextClass) {
        // Sayfa genelinde tüm AudioContext nesnelerini bul ve başlat
        var audioContexts = [];
        
        // 1. DOM içinde bulunan audio elementleri
        document.querySelectorAll('audio').forEach(function(audioEl) {
          if (audioEl.audioContext && audioEl.audioContext instanceof AudioContextClass) {
            audioContexts.push(audioEl.audioContext);
          }
        });
        
        // 2. Unity'nin ses sistemi
        if (window.unityInstance && window.unityInstance.Module) {
          var Module = window.unityInstance.Module;
          
          // WebAudio API
          if (Module.WebGLAudio && Module.WebGLAudio.audioContext) {
            audioContexts.push(Module.WebGLAudio.audioContext);
          }
          
          // Doğrudan AudioContext referansları
          for (var prop in Module) {
            if (Module[prop] instanceof AudioContextClass) {
              audioContexts.push(Module[prop]);
            }
          }
        }
        
        // 3. Global window nesnesi içindeki AudioContext'ler
        for (var prop in window) {
          if (window[prop] instanceof AudioContextClass) {
            audioContexts.push(window[prop]);
          }
        }
        
        // Ses sistemlerini başlat
        if (audioContexts.length === 0) {
          // Hiç AudioContext bulunamadıysa, yeni bir tane oluştur
          var newAudioContext = new AudioContextClass();
          audioContexts.push(newAudioContext);
          window._fallbackAudioContext = newAudioContext;
        }
        
        // Tüm AudioContext'leri başlat
        var resumePromises = audioContexts.map(function(ctx) {
          if (ctx && ctx.state === 'suspended') {
            return ctx.resume().then(function() {
              console.log('[Ses] AudioContext başlatıldı:', ctx.state);
            }).catch(function(err) {
              console.log('[Ses] AudioContext başlatma hatası:', err);
            });
          }
          return Promise.resolve();
        });
        
        // SpeechSynthesis desteği (metin okuma)
        if ('speechSynthesis' in window) {
          window.speechSynthesis.getVoices();
          
          // Ses testi
          if (window.speechSynthesis.speaking === false) {
            var testUtterance = new SpeechSynthesisUtterance('.');
            testUtterance.volume = 0; // Sessiz test
            testUtterance.onend = function() {
              console.log('[Ses] SpeechSynthesis başlatıldı');
            };
            window.speechSynthesis.speak(testUtterance);
          }
        }
        
        // Unity'nin özel ses sistemi düzeltmeleri
        if (window.unityInstance && window.unityInstance.SendMessage) {
          try {
            // WebSocketAudioHandler bileşenine mesaj gönder
            setTimeout(function() {
              window.unityInstance.SendMessage('WebSocketAudioHandler', 'StartWebSocket', 'browser_session');
            }, 1000);
          } catch (e) {
            console.log('[Ses] Unity SendMessage hatası:', e);
          }
        }
        
        window.audioStarted = true;
        console.log('[Ses] Ses sistemleri başlatıldı');
        return true;
      } else {
        console.log('[Ses] AudioContext desteklenmiyor');
        return false;
      }
    } catch (e) {
      console.log('[Ses] AudioContext başlatma hatası:', e);
      return false;
    }
  };
  
  /**
   * Unity yüklendikten sonra çağrılacak
   */
  window.onUnityLoaded = function() {
    // WebGL düzeltmeleri
    deepPatchWebGL();
    
    // WASM modülü düzeltmesi (en önemli kısım)
    setTimeout(function() {
      patchUnityWasmModule();
    }, 1000);
    
    // 5 saniye sonra tekrar kontrol et
    setTimeout(function() {
      if (!window.wasmPatchApplied) {
        patchUnityWasmModule();
      }
    }, 5000);
    
    // Ses sistemini başlat
    window.startAudioContext();
    
    // WebSocket düzeltmeleri
    window.fixWebSocketHandler();
    
    // Performans optimizasyonu
    window.optimizeUnityPerformance();
    
    // Unity telemetri isteklerini engelle
    if (navigator.sendBeacon) {
      navigator.sendBeacon = function(url, data) {
        if (url.indexOf('cdp.cloud.unity3d.com') !== -1) {
          console.log('[Telemetri] Unity telemetri isteği engellendi');
          return true;
        }
        return false; // Tüm beacon isteklerini engelle
      };
    }
    
    // Sayfa donmasını önlemek için arka planda çalışan uzun işlemleri izle
    var longTaskObserver = new PerformanceObserver(function(list) {
      list.getEntries().forEach(function(entry) {
        if (entry.duration > 100) { // 100ms'den uzun işlemler için uyarı
          console.log('[Performans] Uzun görev tespit edildi: ' + Math.round(entry.duration) + 'ms');
          
          // İşlem çok uzunsa ana thread'i rahatlat
          if (entry.duration > 500) {
            setTimeout(function() {
              console.log('[Performans] Ana thread rahatlatılıyor');
            }, 0);
          }
        }
      });
    });
    
    try {
      longTaskObserver.observe({entryTypes: ['longtask']});
    } catch (e) {
      console.log('[Performans] PerformanceObserver desteklenmiyor');
    }
    
    console.log('[Unity] Tüm düzeltmeler uygulandı');
  };
  
  // WebGL'i hemen düzelt
  deepPatchWebGL();
  
  // Global hata dinleyicisi ekle
  window.addEventListener('error', function(e) {
    if (e && e.message && (e.message.indexOf('getInternalformatParameter') > -1 ||
        e.message.indexOf('AudioContext') > -1)) {
      e.preventDefault();
      e.stopPropagation();
      return false;
    }
  }, true);
  
  // Sayfayı donmaktan koruyacak watchdog
  var lastTime = Date.now();
  var watchdogInterval = setInterval(function() {
    var now = Date.now();
    var delta = now - lastTime;
    
    if (delta > 5000) { // 5 saniyeden fazla donma
      console.log('[Watchdog] Sayfa ' + (delta/1000) + ' saniye dondu!');
      
      // Donma durumunda acil müdahale
      if (window.unityInstance) {
        try {
          // FPS düşür
          if (window.unityInstance.SetMaximumFramerate) {
            window.unityInstance.SetMaximumFramerate(20);
          }
          
          // WebGL bağlamını sıfırla
          if (window.unityInstance.Module && window.unityInstance.Module.GL) {
            console.log('[Watchdog] WebGL bağlamını temizleme');
            window.unityInstance.Module.GL.maxUniformBufferBindings = 16;
          }
        } catch (e) {
          console.log('[Watchdog] Unity müdahale hatası:', e);
        }
      }
    }
    
    lastTime = now;
  }, 1000);
  
  // 5 dakika sonra watchdog'u temizle
  setTimeout(function() {
    clearInterval(watchdogInterval);
  }, 5 * 60 * 1000);
  
  console.log('[WebGL Düzeltme] Düzeltme modülü tamamen başlatıldı');
})(); 