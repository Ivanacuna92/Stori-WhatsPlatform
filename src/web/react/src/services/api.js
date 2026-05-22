const API_BASE = '/api';

// Configuración para incluir cookies en todas las requests
const fetchWithCredentials = async (url, options = {}) => {
  const response = await fetch(url, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers
    }
  });
  return response;
};

// ===== FUNCIONES DE AUTENTICACIÓN =====

export async function login(email, password) {
  const response = await fetchWithCredentials(`${API_BASE}/auth/login`, {
    method: 'POST',
    body: JSON.stringify({ email, password })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Error al iniciar sesión');
  }

  return response.json();
}

export async function logout() {
  const response = await fetchWithCredentials(`${API_BASE}/auth/logout`, {
    method: 'POST'
  });

  if (!response.ok) {
    throw new Error('Error al cerrar sesión');
  }

  return response.json();
}

export async function checkAuth() {
  const response = await fetchWithCredentials(`${API_BASE}/auth/me`);

  if (!response.ok) {
    if (response.status === 401) {
      return null;
    }
    throw new Error('Error verificando autenticación');
  }

  return response.json();
}

// ===== FUNCIONES DE STATS Y LOGS =====

export async function fetchStats(date) {
  const url = date ? `${API_BASE}/stats/${date}` : `${API_BASE}/stats`;
  const response = await fetchWithCredentials(url);
  if (!response.ok) throw new Error('Error fetching stats');
  return response.json();
}

export async function fetchDates() {
  const response = await fetchWithCredentials(`${API_BASE}/dates`);
  if (!response.ok) throw new Error('Error fetching dates');
  return response.json();
}

// ===== FUNCIONES DE MENSAJES =====

export async function sendMessage(phone, message) {
  let formattedPhone = phone;
  if (!phone.includes('@')) {
    formattedPhone = `${phone}@s.whatsapp.net`;
  }

  const response = await fetchWithCredentials(`${API_BASE}/send-message`, {
    method: 'POST',
    body: JSON.stringify({ phone: formattedPhone, message })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.details || 'Error enviando mensaje');
  }

  return response.json();
}

export async function deleteConversation(phone) {
  const response = await fetchWithCredentials(`${API_BASE}/delete-conversation`, {
    method: 'POST',
    body: JSON.stringify({ phone })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.details || 'Error eliminando conversación');
  }

  return response.json();
}

export async function archiveConversation(phone) {
  const response = await fetchWithCredentials(`${API_BASE}/archive-conversation`, {
    method: 'POST',
    body: JSON.stringify({ phone })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.details || 'Error archivando conversación');
  }

  return response.json();
}

export async function unarchiveConversation(phone) {
  const response = await fetchWithCredentials(`${API_BASE}/unarchive-conversation`, {
    method: 'POST',
    body: JSON.stringify({ phone })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.details || 'Error desarchivando conversación');
  }

  return response.json();
}

export async function getArchivedConversations() {
  const response = await fetchWithCredentials(`${API_BASE}/archived-conversations`);

  if (!response.ok) {
    throw new Error('Error obteniendo conversaciones archivadas');
  }

  return response.json();
}

// ===== FUNCIONES DE WHATSAPP =====

export async function checkWhatsAppStatus() {
  try {
    const response = await fetchWithCredentials(`${API_BASE}/qr`);

    if (!response.ok) {
      return { connected: false, error: true };
    }

    const data = await response.json();
    return { connected: !data.qr, error: false };
  } catch (error) {
    return { connected: false, error: true };
  }
}

// ===== FUNCIONES DE GESTIÓN DE USUARIOS (MULTI-USER) =====

export async function getUsers() {
  const response = await fetchWithCredentials(`${API_BASE}/users`);

  if (!response.ok) {
    throw new Error('Error al obtener usuarios');
  }

  return response.json();
}

export async function createUser(userData) {
  const response = await fetchWithCredentials(`${API_BASE}/users`, {
    method: 'POST',
    body: JSON.stringify(userData)
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Error al crear usuario');
  }

  return response.json();
}

export async function updateUser(id, userData) {
  const response = await fetchWithCredentials(`${API_BASE}/users/${id}`, {
    method: 'PUT',
    body: JSON.stringify(userData)
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Error al actualizar usuario');
  }

  return response.json();
}

export async function deleteUser(id) {
  const response = await fetchWithCredentials(`${API_BASE}/users/${id}`, {
    method: 'DELETE'
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Error al eliminar usuario');
  }

  return response.json();
}

// ===== FUNCIONES DE GESTIÓN DE INSTANCIAS DE WHATSAPP =====

export async function getMyQR() {
  const response = await fetchWithCredentials(`${API_BASE}/my-instance/qr`);

  if (!response.ok) {
    throw new Error('Error al obtener código QR');
  }

  return response.json();
}

export async function getMyStatus() {
  const response = await fetchWithCredentials(`${API_BASE}/my-instance/status`);

  if (!response.ok) {
    throw new Error('Error al obtener estado de instancia');
  }

  return response.json();
}

export async function resetMySession() {
  const response = await fetchWithCredentials(`${API_BASE}/my-instance/logout`, {
    method: 'POST'
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Error al reiniciar sesión');
  }

  return response.json();
}

export async function forceRestartMySession() {
  const response = await fetchWithCredentials(`${API_BASE}/my-instance/force-restart`, {
    method: 'POST'
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Error al forzar reinicio');
  }

  return response.json();
}

export async function getInstances() {
  const response = await fetchWithCredentials(`${API_BASE}/instances`);

  if (!response.ok) {
    throw new Error('Error al obtener instancias');
  }

  return response.json();
}

// ===== FUNCIONES DE CONTACTOS FILTRADOS POR USUARIO =====

export async function getMyContacts() {
  try {
    const response = await fetchWithCredentials(`${API_BASE}/my-contacts`);

    if (!response.ok) {
      if (response.status === 401) {
        window.location.href = '/';
        return [];
      }
      throw new Error('Error al obtener contactos');
    }

    const contacts = await response.json();
    return contacts;
  } catch (error) {
    throw error;
  }
}

export async function addContact(phone, name = null) {
  const response = await fetchWithCredentials(`${API_BASE}/my-contacts/add`, {
    method: 'POST',
    body: JSON.stringify({ phone, name })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Error al agregar contacto');
  }

  return response.json();
}

export async function sendMyMessage(phone, message) {
  const response = await fetchWithCredentials(`${API_BASE}/my-instance/send-message`, {
    method: 'POST',
    body: JSON.stringify({ phone, message })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.details || error.error || 'Error enviando mensaje');
  }

  return response.json();
}

export async function updateContactName(phone, name) {
  const response = await fetchWithCredentials(`${API_BASE}/my-contacts/${phone}/name`, {
    method: 'PUT',
    body: JSON.stringify({ name })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Error al actualizar nombre');
  }

  return response.json();
}
