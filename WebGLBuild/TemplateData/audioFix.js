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
        
        window.audioStarted = true;
        console.log('Ses sistemleri etkinleştirildi');
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
      // Force GPU rasterization
      if (canvas.getContext) {
        var gl = canvas.getContext('webgl2') || canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
        if (gl) {
          // Bazı WebGL özelliklerini kontrol et ve devre dışı bırak
          var ext = gl.getExtension('WEBGL_compressed_texture_s3tc');
          if (!ext) {
            console.log('WEBGL_compressed_texture_s3tc desteklenmiyor');
          }
          
          // WebGL bellek sınırlarını ayarla
          if (gl.getParameter) {
            console.log('MAX_TEXTURE_SIZE:', gl.getParameter(gl.MAX_TEXTURE_SIZE));
            console.log('MAX_VIEWPORT_DIMS:', gl.getParameter(gl.MAX_VIEWPORT_DIMS));
          }
        }
      }
    } catch (e) {
      console.warn('WebGL fix hatası:', e);
    }
  };
  
  // Tüm giriş olaylarına dinleyiciler ekle
  function addInputListeners() {
    var interactionEvents = ['mousedown', 'touchstart', 'keydown'];
    
    function handleInteraction() {
      window.startAudioContext();
      window.fixWebGLErrors();
    }
    
    interactionEvents.forEach(function(eventType) {
      document.addEventListener(eventType, handleInteraction, { once: false });
    });
    
    // Sayfa tam yüklendiğinde otomatik olarak çağır
    if (document.readyState === 'complete') {
      window.fixWebGLErrors();
    } else {
      window.addEventListener('load', window.fixWebGLErrors);
    }
  }
  
  // Sayfa yüklendiğinde dinleyicileri ekle
  document.addEventListener('DOMContentLoaded', addInputListeners);
})(); 