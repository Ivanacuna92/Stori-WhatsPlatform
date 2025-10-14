import React, { useState, useEffect } from 'react';
import logo from '../assets/logo.svg';
import icono from '../assets/icono.jpeg';
import { checkWhatsAppStatus } from '../services/api';

function Header({ currentView, onViewChange, user, onLogout }) {
  const [whatsappStatus, setWhatsappStatus] = useState({ connected: false, loading: true });

  useEffect(() => {
    // Verificar estado inicial
    checkStatus();

    // Polling cada 10 segundos
    const interval = setInterval(checkStatus, 10000);

    return () => clearInterval(interval);
  }, []);

  const checkStatus = async () => {
    const status = await checkWhatsAppStatus();
    setWhatsappStatus({ connected: status.connected, loading: false });
  };
  return (
    <header className="sticky top-0 z-50 bg-white px-6 py-3" style={{
      borderBottom: '1px solid #E8EBED',
      boxShadow: '0 1px 3px rgba(0, 0, 0, 0.02)'
    }}>
      <div className="flex justify-between items-center relative">
        {/* Logo */}
        <div className="flex items-center">
          <img src={icono} alt="Aloia" className="h-8" />
        </div>

        {/* Navegación - Centrada absolutamente */}
        <nav className="absolute left-1/2 transform -translate-x-1/2 flex gap-1">
          {user?.role === 'admin' && (
            <button
              className="px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200"
              style={{
                background: currentView === 'dashboard' ? '#5c19e3' : 'transparent',
                color: currentView === 'dashboard' ? 'white' : '#6B7280'
              }}
              onMouseEnter={(e) => {
                if (currentView !== 'dashboard') {
                  e.target.style.background = '#F3F4F6';
                  e.target.style.color = '#374151';
                }
              }}
              onMouseLeave={(e) => {
                if (currentView !== 'dashboard') {
                  e.target.style.background = 'transparent';
                  e.target.style.color = '#6B7280';
                }
              }}
              onClick={() => onViewChange('dashboard')}
            >
              Dashboard
            </button>
          )}
          <button
            className="px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200"
            style={{
              background: currentView === 'reports' ? '#5c19e3' : 'transparent',
              color: currentView === 'reports' ? 'white' : '#6B7280'
            }}
            onMouseEnter={(e) => {
              if (currentView !== 'reports') {
                e.target.style.background = '#F3F4F6';
                e.target.style.color = '#374151';
              }
            }}
            onMouseLeave={(e) => {
              if (currentView !== 'reports') {
                e.target.style.background = 'transparent';
                e.target.style.color = '#6B7280';
              }
            }}
            onClick={() => onViewChange('reports')}
          >
            Reportes
          </button>
          <button
            className="px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200"
            style={{
              background: currentView === 'contacts' ? '#5c19e3' : 'transparent',
              color: currentView === 'contacts' ? 'white' : '#6B7280'
            }}
            onMouseEnter={(e) => {
              if (currentView !== 'contacts') {
                e.target.style.background = '#F3F4F6';
                e.target.style.color = '#374151';
              }
            }}
            onMouseLeave={(e) => {
              if (currentView !== 'contacts') {
                e.target.style.background = 'transparent';
                e.target.style.color = '#6B7280';
              }
            }}
            onClick={() => onViewChange('contacts')}
          >
            Contactos
          </button>
          {user?.role === 'admin' && (
            <button
              className="px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 relative"
              style={{
                background: currentView === 'whatsapp' ? '#5c19e3' : 'transparent',
                color: currentView === 'whatsapp' ? 'white' : '#6B7280'
              }}
              onMouseEnter={(e) => {
                if (currentView !== 'whatsapp') {
                  e.target.style.background = '#F3F4F6';
                  e.target.style.color = '#374151';
                }
              }}
              onMouseLeave={(e) => {
                if (currentView !== 'whatsapp') {
                  e.target.style.background = 'transparent';
                  e.target.style.color = '#6B7280';
                }
              }}
              onClick={() => onViewChange('whatsapp')}
            >
              Sesión
              {/* Indicador de estado de WhatsApp */}
              <span
                className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-white transition-all"
                style={{
                  background: whatsappStatus.loading ? '#F59E0B' : whatsappStatus.connected ? '#22C55E' : '#EF4444',
                  boxShadow: whatsappStatus.loading ? '0 0 4px rgba(245, 158, 11, 0.4)' : whatsappStatus.connected ? '0 0 4px rgba(34, 197, 94, 0.4)' : '0 0 4px rgba(239, 68, 68, 0.4)'
                }}
                title={whatsappStatus.loading ? 'Verificando conexión...' : whatsappStatus.connected ? 'WhatsApp conectado' : 'WhatsApp desconectado'}
              ></span>
            </button>
          )}
        </nav>

        {/* Usuario y logout */}
        {user && (
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg" style={{
              background: '#F3F4F6'
            }}>
              <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-semibold" style={{
                background: 'linear-gradient(135deg, #5c19e3 0%, #4c10d4 100%)'
              }}>
                {user.name?.charAt(0).toUpperCase() || 'U'}
              </div>
              <div className="text-xs">
                <div className="font-semibold text-gray-800">{user.name}</div>
                <div className="text-[10px] text-gray-500">{user.role === 'admin' ? 'Admin' : 'Soporte'}</div>
              </div>
            </div>
            <button
              onClick={onLogout}
              className="px-3 py-2 text-xs font-medium rounded-lg transition-all duration-200"
              style={{
                background: 'rgba(239, 68, 68, 0.1)',
                color: '#EF4444'
              }}
              onMouseEnter={(e) => {
                e.target.style.background = '#EF4444';
                e.target.style.color = 'white';
              }}
              onMouseLeave={(e) => {
                e.target.style.background = 'rgba(239, 68, 68, 0.1)';
                e.target.style.color = '#EF4444';
              }}
            >
              Salir
            </button>
          </div>
        )}
      </div>
    </header>
  );
}

export default Header;