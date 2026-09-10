import { Component, OnInit, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';

@Component({
  selector: 'app-root',
  standalone: true,
  styles: `
    .container {
      min-height: 100vh;
      display: flex;
      flex-direction: column;
    }

    header {
      background: linear-gradient(135deg, #8B0000 0%, #a50000 100%);
      color: white;
      padding: 1.5rem 2rem;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
    }

    .header-content {
      max-width: 1200px;
      margin: 0 auto;
      display: flex;
      align-items: center;
      gap: 1rem;
    }

    .logo {
      font-size: 2rem;
    }

    .header-text h1 {
      font-size: 1.8rem;
      font-weight: 600;
      letter-spacing: 1px;
    }

    .header-text p {
      font-size: 0.9rem;
      opacity: 0.9;
      margin-top: 0.25rem;
    }

    main {
      flex: 1;
      display: flex;
      justify-content: center;
      align-items: center;
      padding: 2rem;
    }

    .card {
      background: white;
      border-radius: 12px;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.1);
      padding: 2.5rem;
      max-width: 500px;
      width: 100%;
      text-align: center;
    }

    .status-badge {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      background: #d4edda;
      color: #155724;
      padding: 0.5rem 1rem;
      border-radius: 20px;
      font-size: 0.9rem;
      font-weight: 500;
      margin-bottom: 1.5rem;
    }

    .status-badge.error {
      background: #f8d7da;
      color: #721c24;
    }

    .card h2 {
      color: #8B0000;
      font-size: 1.5rem;
      margin-bottom: 1rem;
    }

    .card p {
      color: #666;
      line-height: 1.6;
    }

    .response-box {
      background: #f8f9fa;
      border-left: 4px solid #8B0000;
      padding: 1rem;
      margin-top: 1.5rem;
      border-radius: 0 8px 8px 0;
      text-align: left;
    }

    .response-box strong {
      color: #8B0000;
      display: block;
      margin-bottom: 0.5rem;
      font-size: 0.85rem;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .response-box span {
      color: #333;
      font-size: 1.1rem;
    }

    footer {
      background: #333;
      color: white;
      text-align: center;
      padding: 1rem;
      font-size: 0.85rem;
    }

    footer span {
      color: #FFD700;
    }
  `,
  template: `
    <div class="container">
      <header>
        <div class="header-content">
          <span class="logo">🍗</span>
          <div class="header-text">
            <h1>FRATELLI'S RESTAURANTE</h1>
            <p>Sistema de Gestión Integral</p>
          </div>
        </div>
      </header>

      <main>
        <div class="card">
          <div class="status-badge" [class.error]="error()">
            <span>{{ error() ? '❌' : '✅' }}</span>
            {{ error() ? 'Error de Conexión' : 'Conexión Exitosa' }}
          </div>

          <h2>Prueba de Sistema</h2>
          <p>Verificando conexión con el servidor backend...</p>

          <div class="response-box">
            <strong>Respuesta desde el Backend:</strong>
            <span>{{ respuesta() }}</span>
          </div>
        </div>
      </main>

      <footer>
        <span>Fratelli's Restaurante</span> — Av. Ferrocarril N° 973, Huancayo
      </footer>
    </div>
  `
})
export class App implements OnInit {
  respuesta = signal<string>('Cargando datos del servidor...');
  error = signal<boolean>(false);
  private http = inject(HttpClient);

  ngOnInit() {
    this.http.get<{ respuesta: string }>('https://polleria-backend-6kym.onrender.com/api/mensaje')
      .subscribe({
        next: (data) => {
          this.respuesta.set(data.respuesta);
        },
        error: (err) => {
          console.error('Error en la petición:', err);
          this.error.set(true);
          this.respuesta.set('Error al conectar con el servidor backend');
        }
      });
  }
}
