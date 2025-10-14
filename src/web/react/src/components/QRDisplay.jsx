import React, { useState, useEffect, useRef } from 'react';

function QRDisplay() {
  const [qrData, setQrData] = useState(null);
  const [status, setStatus] = useState('loading');
  const [isResetting, setIsResetting] = useState(false);
  const qrCanvasRef = useRef(null);
  const intervalRef = useRef(null);
  const qrcodeRef = useRef(null);

  useEffect(() => {
    // Cargar librería QRCode si no está disponible
    if (!window.QRCode) {
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js';
      script.async = true;
      script.onload = () => {
        checkQR();
        intervalRef.current = setInterval(checkQR, 3000);
      };
      document.body.appendChild(script);
    } else {
      checkQR();
      intervalRef.current = setInterval(checkQR, 3000);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  const checkQR = async () => {
    try {
      const response = await fetch('/api/qr');
      const data = await response.json();

      if (data.qr) {
        setStatus('waiting');
        setQrData(data.qr);

        // Generar QR Code
        if (qrCanvasRef.current && window.QRCode) {
          // Limpiar canvas anterior
          qrCanvasRef.current.innerHTML = '';

          // Crear nuevo QR
          qrcodeRef.current = new window.QRCode(qrCanvasRef.current, {
            text: data.qr,
            width: 256,
            height: 256,
            colorDark: "#000000",
            colorLight: "#ffffff",
            correctLevel: window.QRCode?.CorrectLevel?.M || 0
          });
        }
      } else {
        setStatus('connected');
        setQrData(null);
        if (qrCanvasRef.current) {
          qrCanvasRef.current.innerHTML = '';
        }
      }
    } catch (error) {
      console.error('Error obteniendo QR:', error);
      setStatus('error');
    }
  };

  const handleResetSession = async () => {
    if (isResetting) return;

    if (!confirm('¿Estás seguro de que quieres reiniciar la sesión de WhatsApp?')) {
      return;
    }

    setIsResetting(true);
    try {
      const response = await fetch('/api/logout', { method: 'POST' });
      const data = await response.json();

      if (data.success) {
        setStatus('waiting');
        setTimeout(checkQR, 3000);
      } else {
        setStatus('error');
      }
    } catch (error) {
      console.error('Error reiniciando sesión:', error);
      setStatus('error');
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <div className="flex-1 flex items-center justify-center p-8" style={{ background: '#FAFBFC' }}>
      <div className="bg-white rounded-2xl p-8 max-w-lg w-full" style={{
        boxShadow: '0 4px 20px rgba(0, 0, 0, 0.08)',
        border: '1px solid #E8EBED'
      }}>
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-2xl font-semibold text-gray-800 mb-2">
            Sesión de WhatsApp
          </h1>
          <p className="text-sm text-gray-500">
            Escanea el código QR para vincular tu dispositivo
          </p>
        </div>

        {/* QR Area */}
        <div className="rounded-xl p-8 flex items-center justify-center min-h-[320px]" style={{
          background: '#FAFBFC',
          border: '1px solid #E8EBED'
        }}>
          {status === 'loading' && (
            <div className="flex flex-col items-center space-y-4">
              <div className="animate-spin rounded-full h-16 w-16 border-4 border-gray-200 border-t-purple-600"></div>
              <p className="text-sm text-gray-600">Generando código QR...</p>
            </div>
          )}

          {status === 'waiting' && qrData && (
            <div className="flex flex-col items-center">
              <div ref={qrCanvasRef} className="flex items-center justify-center bg-white p-4 rounded-xl" style={{
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)'
              }}></div>
              <p className="text-xs text-gray-500 mt-4">Código válido por 60 segundos</p>
            </div>
          )}

          {status === 'connected' && (
            <div className="text-center">
              <div className="inline-flex items-center justify-center w-20 h-20 rounded-full mb-4" style={{
                background: 'rgba(34, 197, 94, 0.1)'
              }}>
                <svg className="w-10 h-10 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="text-lg font-semibold text-gray-800 mb-1">
                Conectado
              </p>
              <p className="text-sm text-gray-500">
                Tu sesión está activa
              </p>
            </div>
          )}

          {status === 'error' && (
            <div className="text-center">
              <div className="inline-flex items-center justify-center w-20 h-20 rounded-full mb-4" style={{
                background: 'rgba(239, 68, 68, 0.1)'
              }}>
                <svg className="w-10 h-10 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
              <p className="text-lg font-semibold text-gray-800 mb-1">
                Error de conexión
              </p>
              <p className="text-sm text-gray-500">
                Intenta reiniciar la sesión
              </p>
            </div>
          )}
        </div>

        {/* Alerts */}
        <div className="mt-6">
          {status === 'waiting' && (
            <div className="rounded-xl px-4 py-3 text-sm mb-4" style={{
              background: 'rgba(245, 158, 11, 0.08)',
              border: '1px solid rgba(245, 158, 11, 0.2)',
              color: '#92400E'
            }}>
              <div className="flex items-start gap-2">
                <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                </svg>
                <span>Abre WhatsApp y escanea el código</span>
              </div>
            </div>
          )}

          {status === 'connected' && (
            <div className="rounded-xl px-4 py-3 text-sm mb-4" style={{
              background: 'rgba(34, 197, 94, 0.08)',
              border: '1px solid rgba(34, 197, 94, 0.2)',
              color: '#166534'
            }}>
              <div className="flex items-start gap-2">
                <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <span>Bot conectado y funcionando correctamente</span>
              </div>
            </div>
          )}

          {status === 'error' && (
            <div className="rounded-xl px-4 py-3 text-sm mb-4" style={{
              background: 'rgba(239, 68, 68, 0.08)',
              border: '1px solid rgba(239, 68, 68, 0.2)',
              color: '#991B1B'
            }}>
              <div className="flex items-start gap-2">
                <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
                <span>No se pudo obtener el código QR</span>
              </div>
            </div>
          )}

          {/* Reset Button */}
          <button
            onClick={handleResetSession}
            disabled={isResetting}
            className="w-full px-4 py-3 rounded-xl text-sm font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            style={{
              background: '#5c19e3',
              color: 'white'
            }}
            onMouseEnter={(e) => !isResetting && (e.target.style.background = '#4c10d4')}
            onMouseLeave={(e) => !isResetting && (e.target.style.background = '#5c19e3')}
          >
            {isResetting ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                <span>Reiniciando...</span>
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                <span>Reiniciar Sesión</span>
              </>
            )}
          </button>
        </div>

        {/* Instructions */}
        <div className="mt-6 pt-6 rounded-xl p-4" style={{
          background: '#FAFBFC',
          border: '1px solid #E8EBED'
        }}>
          <p className="text-xs font-semibold text-gray-700 mb-3">Cómo vincular:</p>
          <ol className="space-y-2 text-xs text-gray-600">
            <li className="flex items-start gap-2">
              <span className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-semibold text-white" style={{ background: '#5c19e3' }}>1</span>
              <span>Abre WhatsApp en tu teléfono</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-semibold text-white" style={{ background: '#5c19e3' }}>2</span>
              <span>Ve a Configuración → Dispositivos vinculados</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-semibold text-white" style={{ background: '#5c19e3' }}>3</span>
              <span>Toca "Vincular dispositivo"</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-semibold text-white" style={{ background: '#5c19e3' }}>4</span>
              <span>Escanea el código QR mostrado arriba</span>
            </li>
          </ol>
        </div>
      </div>
    </div>
  );
}

export default QRDisplay;
