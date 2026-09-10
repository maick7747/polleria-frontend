import { Component, OnInit, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';

@Component({
  selector: 'app-root',
  standalone: true,
  template: `
    <div style="text-align: center; margin-top: 50px; font-family: sans-serif;">
      <h1>Conexión Exitosa</h1>
      <p><strong>Respuesta desde el Backend:</strong> {{ respuesta() }}</p>
    </div>
  `
})
export class App implements OnInit {
  // Usamos un Signal para garantizar que la pantalla se actualice al instante
  respuesta = signal<string>('Cargando datos del servidor...');
  private http = inject(HttpClient);

  ngOnInit() {
    this.http.get<{ respuesta: string }>('https://polleria-backend-6kym.onrender.com/api/mensaje')
      .subscribe({
        next: (data) => {
          this.respuesta.set(data.respuesta);
        },
        error: (err) => {
          console.error('Error en la petición:', err);
          this.respuesta.set('Error al conectar con el servidor backend');
        }
      });
  }
}