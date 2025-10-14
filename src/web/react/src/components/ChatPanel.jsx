import React, { useState, useEffect, useRef } from 'react';
import { sendMessage, toggleHumanMode, endConversation } from '../services/api';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

function ChatPanel({ contact, onUpdateContact }) {
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [showEndModal, setShowEndModal] = useState(false);
  const [endingConversation, setEndingConversation] = useState(false);
  const [supportHandledContacts, setSupportHandledContacts] = useState(new Set());
  const [showSupportModal, setShowSupportModal] = useState(false);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    // Scroll automático e instantáneo al cambiar de contacto
    if (contact) {
      // Hacer scroll inmediato sin animación al abrir el chat
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
      }, 0);
    }
  }, [contact?.phone]); // Solo cuando cambia el contacto

  useEffect(() => {
    // Scroll suave cuando llegan nuevos mensajes
    if (contact?.messages && contact.messages.length > 0) {
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    }
  }, [contact?.messages?.length]); // Solo cuando cambia la cantidad de mensajes
  
  useEffect(() => {
    // Mostrar modal solo si es modo soporte Y no hay mensajes HUMAN
    if (contact?.mode === 'support' && contact?.phone) {
      // Verificar si ya hay mensajes de HUMAN en la conversación
      const hasHumanMessages = contact.messages?.some(msg => msg.type === 'HUMAN');
      
      // Solo mostrar si:
      // 1. No hay mensajes HUMAN (nadie ha tomado control)
      // 2. No se ha mostrado antes para este contacto en esta sesión
      if (!hasHumanMessages && !supportHandledContacts.has(contact.phone)) {
        setShowSupportModal(true);
        setSupportHandledContacts(prev => new Set([...prev, contact.phone]));
      } else if (hasHumanMessages) {
        // Si ya hay mensajes HUMAN, cerrar el modal si está abierto
        setShowSupportModal(false);
      }
    }
  }, [contact?.mode, contact?.phone, contact?.messages]);

  const handleSend = async () => {
    if (!message.trim() || !contact || sending) return;

    if (!contact.isHumanMode && contact.mode !== 'support') {
      // No usar alert, simplemente no enviar
      return;
    }

    setSending(true);
    try {
      await sendMessage(contact.phone, message);
      setMessage('');
      
      const newMessage = {
        type: 'HUMAN',
        message: message,
        timestamp: new Date().toISOString()
      };
      
      onUpdateContact({
        ...contact,
        messages: [...(contact.messages || []), newMessage]
      });
    } catch (error) {
      alert('Error enviando mensaje: ' + error.message);
    } finally {
      setSending(false);
    }
  };

  const handleToggleMode = async () => {
    try {
      // Si está en modo soporte, cambiar a IA
      if (contact.mode === 'support') {
        await toggleHumanMode(contact.phone, false);
        onUpdateContact({ ...contact, isHumanMode: false, mode: 'ai' });
      } else {
        const newMode = !contact.isHumanMode;
        await toggleHumanMode(contact.phone, newMode);
        onUpdateContact({ ...contact, isHumanMode: newMode, mode: newMode ? 'human' : 'ai' });
      }
    } catch (error) {
      // Error silencioso
    }
  };

  const handleEndConversation = async () => {
    setEndingConversation(true);
    
    try {
      await endConversation(contact.phone);
      
      // Agregar mensaje de sistema a la conversación
      const systemMessage = {
        type: 'SYSTEM',
        message: '⏰ Tu sesión de conversación ha finalizado. Puedes escribirme nuevamente para iniciar una nueva conversación.',
        timestamp: new Date().toISOString()
      };
      
      onUpdateContact({
        ...contact,
        messages: [...(contact.messages || []), systemMessage],
        isHumanMode: false
      });
      
      setShowEndModal(false);
      setEndingConversation(false);
    } catch (error) {
      setEndingConversation(false);
      alert('Error finalizando conversación: ' + error.message);
    }
  };

  if (!contact) {
    return (
      <div className="flex-1 flex items-center justify-center" style={{ background: '#FAFBFC' }}>
        <div className="text-center">
          <div className="mb-4">
            <svg className="w-20 h-20 mx-auto text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
          </div>
          <h3 className="text-xl font-semibold text-gray-800 mb-2">Selecciona un chat</h3>
          <p className="text-sm text-gray-500">Elige una conversación de la lista para comenzar</p>
        </div>
      </div>
    );
  }


  const isSupport = contact.mode === 'support';
  const isHuman = contact.isHumanMode;

  const modeColor = isSupport ? '#F97316' : isHuman ? '#3B82F6' : '#5c19e3';
  const modeLabel = isSupport ? 'Soporte' : isHuman ? 'Humano' : 'IA';

  return (
    <div className="flex-1 flex flex-col" style={{ background: '#FAFBFC' }}>
      {/* Header moderno */}
      <div className="bg-white px-6 py-4 flex items-center justify-between" style={{
        borderBottom: '1px solid #E8EBED',
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.02)'
      }}>
        <div className="flex items-center gap-4">
          <div className="relative">
            <div className="w-12 h-12 rounded-full flex items-center justify-center text-white font-semibold text-sm" style={{
              background: isSupport ? 'linear-gradient(135deg, #F97316 0%, #EA580C 100%)' : '#9CA3AF'
            }}>
              {isSupport ? '👤' : contact.phone.slice(-2)}
            </div>
            {/* Indicador de modo */}
            <div
              className="absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full border-2 border-white"
              style={{ background: modeColor }}
            ></div>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-gray-800">{contact.phone}</h3>
              <span
                className="text-[10px] px-2 py-0.5 rounded-md font-medium"
                style={{
                  background: isSupport
                    ? 'rgba(249, 115, 22, 0.1)'
                    : isHuman
                      ? 'rgba(59, 130, 246, 0.1)'
                      : 'rgba(92, 25, 227, 0.1)',
                  color: modeColor
                }}
              >
                {modeLabel.toUpperCase()}
              </span>
            </div>
            <span className="text-xs text-gray-500">
              {contact.messages?.length || 0} mensajes
            </span>
          </div>
        </div>

        {/* Botones de acción */}
        <div className="flex gap-2">
          {isSupport ? (
            <>
              <button
                className="px-4 py-2 rounded-xl text-sm font-medium transition-all"
                style={{
                  background: 'rgba(249, 115, 22, 0.1)',
                  color: '#F97316',
                  border: '1px solid transparent'
                }}
                onMouseEnter={(e) => {
                  e.target.style.background = '#F97316';
                  e.target.style.color = 'white';
                }}
                onMouseLeave={(e) => {
                  e.target.style.background = 'rgba(249, 115, 22, 0.1)';
                  e.target.style.color = '#F97316';
                }}
                onClick={async () => {
                  await toggleHumanMode(contact.phone, false);
                  onUpdateContact({ ...contact, isHumanMode: false, mode: 'ai' });

                  const transferMessage = "El soporte ha finalizado. Continuaré atendiéndote con mucho gusto. ¿Hay algo más en lo que pueda ayudarte?";
                  await sendMessage(contact.phone, transferMessage);

                  const newMessage = {
                    type: 'BOT',
                    message: transferMessage,
                    timestamp: new Date().toISOString()
                  };

                  onUpdateContact({
                    ...contact,
                    messages: [...(contact.messages || []), newMessage],
                    isHumanMode: false,
                    mode: 'ai'
                  });
                }}
                title="Regresar el control al bot"
              >
                Finalizar Soporte
              </button>
              <button
                className="px-4 py-2 rounded-xl text-sm font-medium text-white transition-all"
                style={{ background: '#EF4444' }}
                onMouseEnter={(e) => e.target.style.background = '#DC2626'}
                onMouseLeave={(e) => e.target.style.background = '#EF4444'}
                onClick={() => setShowEndModal(true)}
              >
                Finalizar Chat
              </button>
            </>
          ) : isHuman ? (
            <>
              <button
                className="px-4 py-2 rounded-xl text-sm font-medium transition-all"
                style={{
                  background: 'rgba(59, 130, 246, 0.1)',
                  color: '#3B82F6'
                }}
                onMouseEnter={(e) => {
                  e.target.style.background = '#3B82F6';
                  e.target.style.color = 'white';
                }}
                onMouseLeave={(e) => {
                  e.target.style.background = 'rgba(59, 130, 246, 0.1)';
                  e.target.style.color = '#3B82F6';
                }}
                onClick={handleToggleMode}
              >
                Activar IA
              </button>
              <button
                className="px-4 py-2 rounded-xl text-sm font-medium text-white transition-all"
                style={{ background: '#EF4444' }}
                onMouseEnter={(e) => e.target.style.background = '#DC2626'}
                onMouseLeave={(e) => e.target.style.background = '#EF4444'}
                onClick={() => setShowEndModal(true)}
              >
                Finalizar Chat
              </button>
            </>
          ) : (
            <button
              className="px-4 py-2 rounded-xl text-sm font-medium transition-all"
              style={{
                background: 'rgba(92, 25, 227, 0.1)',
                color: '#5c19e3'
              }}
              onMouseEnter={(e) => {
                e.target.style.background = '#5c19e3';
                e.target.style.color = 'white';
              }}
              onMouseLeave={(e) => {
                e.target.style.background = 'rgba(92, 25, 227, 0.1)';
                e.target.style.color = '#5c19e3';
              }}
              onClick={handleToggleMode}
            >
              Modo Humano
            </button>
          )}
        </div>
      </div>

      {/* Área de mensajes */}
      <div className="flex-1 overflow-y-auto p-6 space-y-3" style={{ background: '#FAFBFC' }}>
        {contact.messages?.slice().reverse().map((msg, index) => {
          const isClient = msg.type === 'USER' || msg.type === 'CLIENTE' || msg.role === 'cliente';
          const isBotOrSupport = msg.type === 'BOT' || msg.type === 'SOPORTE' || msg.role === 'bot' || msg.role === 'soporte';
          const isHumanOrBot = msg.type === 'HUMAN' || msg.type === 'BOT' || isBotOrSupport;
          const isSystem = msg.type === 'SYSTEM' || (msg.type === 'BOT' && msg.message?.includes('⏰') && msg.message?.includes('sesión'));

          // Determinar el color según el tipo de mensaje específico
          const isMessageFromSupport = msg.type === 'SOPORTE' || msg.role === 'soporte' || (msg.type === 'HUMAN' && contact.mode === 'support');
          const isMessageFromHuman = msg.type === 'HUMAN' && contact.mode !== 'support';
          const isMessageFromBot = msg.type === 'BOT';

          if (isSystem) {
            return (
              <div key={index} className="flex justify-center my-4">
                <div className="bg-white px-4 py-2.5 rounded-xl max-w-md text-center shadow-sm" style={{
                  border: '1px solid #E8EBED'
                }}>
                  <div className="flex items-center justify-center gap-2 mb-1">
                    <span className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold">
                      Sistema
                    </span>
                    <span className="text-xs text-gray-400">•</span>
                    <span className="text-[10px] text-gray-400">
                      {new Date(msg.timestamp).toLocaleTimeString('es-ES', {
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </span>
                  </div>
                  <div className="text-xs text-gray-600 leading-relaxed">
                    {msg.message}
                  </div>
                </div>
              </div>
            );
          }
          
          return (
            <div
              key={index}
              className={`flex ${isClient ? 'justify-start' : 'justify-end'}`}
            >
              <div className={`max-w-xs lg:max-w-md px-3 py-2 relative ${
                isClient ? 'bg-white text-gray-900' : 'text-white'
              }`}
              style={isClient ? {
                borderRadius: '12px 12px 12px 2px',
                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.08)',
                border: '1px solid #E8EBED'
              } : {
                borderRadius: '12px 12px 2px 12px',
                backgroundColor: isMessageFromSupport ? '#F97316' : isMessageFromHuman ? '#3B82F6' : '#5c19e3',
                boxShadow: isMessageFromSupport ? '0 2px 8px rgba(249, 115, 22, 0.2)' : isMessageFromHuman ? '0 2px 8px rgba(59, 130, 246, 0.2)' : '0 2px 8px rgba(92, 25, 227, 0.2)'
              }}>
                <div className={`text-[10px] font-semibold mb-1 ${isClient ? 'text-gray-500' : 'text-white/80'}`}>
                  {isClient ? 'Cliente' :
                   msg.role === 'soporte' || msg.type === 'SOPORTE' ? `Soporte${msg.userName ? ` - ${msg.userName}` : ''}` :
                   msg.type === 'HUMAN' ? (contact.mode === 'support' ? 'Soporte' : 'Humano') :
                   msg.type === 'BOT' ? 'Bot' : 'Sistema'}
                </div>
                <div className="text-sm leading-relaxed pr-16">
                  {isClient || isHumanOrBot ? (
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={{
                        p: ({children}) => <p className="mb-2 last:mb-0">{children}</p>,
                        ul: ({children}) => <ul className="list-disc pl-4 mb-2">{children}</ul>,
                        ol: ({children}) => <ol className="list-decimal pl-4 mb-2">{children}</ol>,
                        li: ({children}) => <li className="mb-1">{children}</li>,
                        code: ({inline, children}) =>
                          inline ?
                            <code className={`${isClient ? 'bg-gray-200 text-gray-900' : 'bg-white/20 text-white'} px-1.5 py-0.5 rounded text-xs`}>{children}</code> :
                            <pre className={`${isClient ? 'bg-gray-100 text-gray-900' : 'bg-white/10 text-white'} p-2 rounded overflow-x-auto my-2 text-xs`}><code>{children}</code></pre>,
                        strong: ({children}) => <strong className="font-semibold">{children}</strong>,
                        em: ({children}) => <em className="italic">{children}</em>,
                        a: ({href, children}) => <a href={href} className="underline hover:opacity-80" target="_blank" rel="noopener noreferrer">{children}</a>,
                        h1: ({children}) => <h1 className="text-base font-bold mb-2">{children}</h1>,
                        h2: ({children}) => <h2 className="text-sm font-bold mb-2">{children}</h2>,
                        h3: ({children}) => <h3 className="text-sm font-semibold mb-1">{children}</h3>,
                        blockquote: ({children}) => <blockquote className={`border-l-2 ${isClient ? 'border-gray-400' : 'border-white/40'} pl-2 my-2 italic`}>{children}</blockquote>
                      }}
                    >
                      {msg.message}
                    </ReactMarkdown>
                  ) : (
                    msg.message
                  )}
                </div>
                <div className={`absolute bottom-1 right-2 text-[11px] flex items-center gap-1 ${isClient ? 'text-gray-500' : 'text-white/70'}`}>
                  <span>
                    {new Date(msg.timestamp).toLocaleTimeString('es-ES', {
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </span>
                  {!isClient && msg.status && (
                    <span className="flex items-center ml-0.5">
                      {msg.status === 'sent' && (
                        <svg className="w-[15px] h-[15px]" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"/>
                        </svg>
                      )}
                      {msg.status === 'delivered' && (
                        <svg className="w-[15px] h-[15px]" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"/>
                          <path d="M19.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-0.5-0.5 1.414-1.414 7.086-7.086a1 1 0 011.414 0z"/>
                        </svg>
                      )}
                      {msg.status === 'read' && (
                        <svg className="w-[15px] h-[15px] text-blue-500" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"/>
                          <path d="M19.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-0.5-0.5 1.414-1.414 7.086-7.086a1 1 0 011.414 0z"/>
                        </svg>
                      )}
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Input de mensaje */}
      <div className="bg-white px-6 py-4 flex gap-3" style={{
        borderTop: '1px solid #E8EBED',
        boxShadow: '0 -1px 3px rgba(0, 0, 0, 0.02)'
      }}>
        <input
          type="text"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && handleSend()}
          placeholder={contact.isHumanMode || contact.mode === 'support' ? 'Escribe un mensaje...' : 'Activa MODO HUMANO para escribir'}
          disabled={(!contact.isHumanMode && contact.mode !== 'support') || sending}
          className="flex-1 px-4 py-3 rounded-xl focus:outline-none text-sm transition-all disabled:opacity-50"
          style={{
            background: '#F3F4F6',
            border: '1px solid transparent'
          }}
          onFocus={(e) => {
            if (!e.target.disabled) {
              e.target.style.background = '#ffffff';
              e.target.style.border = '1px solid #5c19e3';
              e.target.style.boxShadow = '0 0 0 3px rgba(92, 25, 227, 0.08)';
            }
          }}
          onBlur={(e) => {
            e.target.style.background = '#F3F4F6';
            e.target.style.border = '1px solid transparent';
            e.target.style.boxShadow = 'none';
          }}
        />
        <button
          onClick={handleSend}
          disabled={(!contact.isHumanMode && contact.mode !== 'support') || sending || !message.trim()}
          className="px-6 py-3 rounded-xl text-sm font-medium text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          style={{
            background: '#5c19e3'
          }}
          onMouseEnter={(e) => {
            if (!e.target.disabled) {
              e.target.style.background = '#4c10d4';
            }
          }}
          onMouseLeave={(e) => {
            if (!e.target.disabled) {
              e.target.style.background = '#5c19e3';
            }
          }}
        >
          {sending ? '...' : 'Enviar'}
        </button>
      </div>

      {/* Modal de soporte activado */}
      {showSupportModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl p-8 max-w-md w-full mx-4" style={{
            boxShadow: '0 20px 50px rgba(0, 0, 0, 0.15)'
          }}>
            <div className="flex items-center justify-center mb-6">
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center" style={{
                background: 'linear-gradient(135deg, #F97316 0%, #EA580C 100%)',
                boxShadow: '0 8px 20px rgba(249, 115, 22, 0.3)'
              }}>
                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
                </svg>
              </div>
            </div>
            <h3 className="text-xl font-semibold mb-2 text-center text-gray-800">
              Cliente Solicita Soporte
            </h3>
            <p className="text-sm text-gray-500 mb-6 text-center">
              El cliente ha solicitado atención personalizada. Puedes tomar el control de la conversación.
            </p>
            <div className="rounded-xl p-4 mb-6" style={{
              background: 'rgba(249, 115, 22, 0.08)',
              border: '1px solid rgba(249, 115, 22, 0.2)'
            }}>
              <p className="text-sm text-gray-700">
                <strong className="text-orange-600">Cliente:</strong> {contact.phone}
              </p>
              <p className="text-sm text-gray-700 mt-1">
                <strong className="text-orange-600">Estado:</strong> Esperando respuesta
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setShowSupportModal(false)}
                className="flex-1 px-4 py-3 rounded-xl text-sm font-medium transition-all"
                style={{
                  background: '#F3F4F6',
                  color: '#6B7280'
                }}
                onMouseEnter={(e) => e.target.style.background = '#E5E7EB'}
                onMouseLeave={(e) => e.target.style.background = '#F3F4F6'}
              >
                Cancelar
              </button>
              <button
                onClick={async () => {
                  try {
                    const currentUser = JSON.parse(localStorage.getItem('currentUser') || '{}');
                    const userName = currentUser.name || 'un especialista';

                    const presentationMessage = `Hola, te atiende ${userName}. 👋\n\nSerá un placer ayudarte con tu consulta. ¿En qué puedo asistirte hoy?`;

                    setShowSupportModal(false);

                    await sendMessage(contact.phone, presentationMessage);

                    const newMessage = {
                      type: 'HUMAN',
                      message: presentationMessage,
                      timestamp: new Date().toISOString()
                    };

                    onUpdateContact({
                      ...contact,
                      messages: [...(contact.messages || []), newMessage]
                    });
                  } catch (error) {
                    alert('Error al tomar control: ' + (error.message || 'Error desconocido'));
                  }
                }}
                className="flex-1 px-4 py-3 rounded-xl text-sm font-medium text-white transition-all"
                style={{ background: '#F97316' }}
                onMouseEnter={(e) => e.target.style.background = '#EA580C'}
                onMouseLeave={(e) => e.target.style.background = '#F97316'}
              >
                Tomar Control
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de confirmación finalizar */}
      {showEndModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl p-8 max-w-md w-full mx-4" style={{
            boxShadow: '0 20px 50px rgba(0, 0, 0, 0.15)'
          }}>
            <h3 className="text-xl font-semibold mb-3 text-gray-800">
              Finalizar Conversación
            </h3>
            <p className="text-sm text-gray-500 mb-6">
              ¿Estás seguro de que deseas finalizar esta conversación? Se enviará un mensaje de cierre al cliente y la sesión cambiará a modo IA.
            </p>
            <div className="rounded-xl p-4 mb-6" style={{
              background: 'rgba(245, 158, 11, 0.08)',
              border: '1px solid rgba(245, 158, 11, 0.2)'
            }}>
              <p className="text-sm text-gray-700">
                Se enviará al cliente: <strong>"⏰ Tu sesión de conversación ha finalizado. Puedes escribirme nuevamente para iniciar una nueva conversación."</strong>
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setShowEndModal(false)}
                disabled={endingConversation}
                className="flex-1 px-4 py-3 rounded-xl text-sm font-medium transition-all disabled:opacity-50"
                style={{
                  background: '#F3F4F6',
                  color: '#6B7280'
                }}
                onMouseEnter={(e) => !endingConversation && (e.target.style.background = '#E5E7EB')}
                onMouseLeave={(e) => !endingConversation && (e.target.style.background = '#F3F4F6')}
              >
                Cancelar
              </button>
              <button
                onClick={handleEndConversation}
                disabled={endingConversation}
                className="flex-1 px-4 py-3 rounded-xl text-sm font-medium text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ background: '#EF4444' }}
                onMouseEnter={(e) => !endingConversation && (e.target.style.background = '#DC2626')}
                onMouseLeave={(e) => !endingConversation && (e.target.style.background = '#EF4444')}
              >
                {endingConversation ? 'Finalizando...' : 'Finalizar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ChatPanel;