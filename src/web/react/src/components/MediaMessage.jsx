import React, { useState } from 'react';

/**
 * Componente para mostrar archivos multimedia en mensajes
 * Soporta imágenes, PDFs y documentos
 */
function MediaMessage({ mediaType, mediaUrl, mediaCaption, message, isClient }) {
  const [imageError, setImageError] = useState(false);
  const [showFullImage, setShowFullImage] = useState(false);

  // Si no hay tipo de media, no mostrar nada
  if (!mediaType || !mediaUrl) {
    return null;
  }

  // Determinar icono según tipo de archivo
  const getFileIcon = () => {
    if (mediaType === 'documents') {
      if (mediaUrl.includes('.pdf')) {
        return (
          <svg className="w-12 h-12" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd"/>
          </svg>
        );
      } else {
        return (
          <svg className="w-12 h-12" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd"/>
          </svg>
        );
      }
    }
    return null;
  };

  // Obtener nombre de archivo de la URL
  const getFileName = () => {
    const parts = mediaUrl.split('/');
    return parts[parts.length - 1] || 'archivo';
  };

  // Renderizar imagen
  if (mediaType === 'images' && !imageError) {
    return (
      <>
        <div className="mb-2 rounded-lg overflow-hidden max-w-xs cursor-pointer" onClick={() => setShowFullImage(true)}>
          <img
            src={mediaUrl}
            alt={mediaCaption || 'Imagen'}
            className="w-full h-auto object-cover hover:opacity-90 transition-opacity"
            onError={() => setImageError(true)}
            style={{ maxHeight: '300px' }}
          />
        </div>
        {mediaCaption && mediaCaption !== 'Imagen sin descripción' && (
          <div className="text-sm mt-1">
            {mediaCaption}
          </div>
        )}

        {/* Modal de imagen completa */}
        {showFullImage && (
          <div
            className="fixed inset-0 bg-black bg-opacity-90 flex items-center justify-center z-[9999]"
            onClick={() => setShowFullImage(false)}
            style={{ margin: 0 }}
          >
            <div className="relative max-w-7xl max-h-screen p-4">
              <button
                onClick={() => setShowFullImage(false)}
                className="absolute top-2 right-2 w-10 h-10 bg-white bg-opacity-20 hover:bg-opacity-30 rounded-full flex items-center justify-center transition-all"
              >
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
              <img
                src={mediaUrl}
                alt={mediaCaption || 'Imagen'}
                className="max-w-full max-h-screen object-contain"
                onClick={(e) => e.stopPropagation()}
              />
              {mediaCaption && mediaCaption !== 'Imagen sin descripción' && (
                <div className="absolute bottom-0 left-0 right-0 bg-black bg-opacity-60 text-white p-4 text-center">
                  {mediaCaption}
                </div>
              )}
            </div>
          </div>
        )}
      </>
    );
  }

  // Renderizar documento (PDF, Word, Excel, etc.)
  if (mediaType === 'documents') {
    const fileName = getFileName();
    const downloadUrl = mediaUrl.replace('/api/media/', '/api/media/') + (mediaUrl.includes('/download') ? '' : '/download');

    return (
      <div className="mb-2">
        <a
          href={downloadUrl}
          download
          className={`flex items-center gap-3 p-3 rounded-lg transition-all ${
            isClient
              ? 'bg-gray-50 hover:bg-gray-100 border border-gray-200'
              : 'bg-white bg-opacity-20 hover:bg-opacity-30'
          }`}
          style={{ maxWidth: '300px' }}
        >
          <div className={`flex-shrink-0 ${isClient ? 'text-gray-600' : 'text-white opacity-80'}`}>
            {getFileIcon()}
          </div>
          <div className="flex-1 min-w-0">
            <div className={`text-sm font-medium truncate ${isClient ? 'text-gray-800' : 'text-white'}`}>
              {mediaCaption || fileName}
            </div>
            <div className={`text-xs ${isClient ? 'text-gray-500' : 'text-white opacity-70'}`}>
              {mediaUrl.includes('.pdf') ? 'Documento PDF' : 'Documento'}
            </div>
          </div>
          <div className={`flex-shrink-0 ${isClient ? 'text-gray-400' : 'text-white opacity-70'}`}>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
          </div>
        </a>
        {message && message !== mediaCaption && (
          <div className="text-sm mt-2">
            {message}
          </div>
        )}
      </div>
    );
  }

  // Si hubo error o tipo no soportado
  return (
    <div className={`text-xs ${isClient ? 'text-gray-500' : 'text-white opacity-70'} italic`}>
      [Archivo multimedia no disponible]
    </div>
  );
}

export default MediaMessage;
