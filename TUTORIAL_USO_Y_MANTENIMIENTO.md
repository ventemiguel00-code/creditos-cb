# Tutorial de uso y mantenimiento

Esta guia te explica como seguir usando, editando y publicando tu proyecto aunque no vuelvas a entrar a esta conversacion.

## 1. Donde esta el proyecto

Tu proyecto esta guardado en esta carpeta:

`C:\Users\pc\Documents\Codex\2026-04-19-act-a-como-un-desarrollador-full`

Tu repositorio en GitHub esta en:

`https://github.com/ventemiguel00-code/creditos-cb`

Tu despliegue en Vercel esta en:

`https://creditos-cb.vercel.app`

## 2. Como abrir el proyecto

### Opcion A: con PowerShell

Abre PowerShell y ejecuta:

```powershell
cd "C:\Users\pc\Documents\Codex\2026-04-19-act-a-como-un-desarrollador-full"
```

Para ver los archivos:

```powershell
dir
```

### Opcion B: con VS Code

Si tienes Visual Studio Code instalado, puedes abrir el proyecto asi:

```powershell
code "C:\Users\pc\Documents\Codex\2026-04-19-act-a-como-un-desarrollador-full"
```

Si `code` no funciona, abre VS Code manualmente y entra a:

`Archivo > Abrir carpeta`

y selecciona:

`C:\Users\pc\Documents\Codex\2026-04-19-act-a-como-un-desarrollador-full`

## 3. Como iniciar la app localmente

En PowerShell, dentro de la carpeta del proyecto, ejecuta:

```powershell
npm.cmd run dev
```

Luego abre en tu navegador:

`http://localhost:3000`

Si el puerto 3000 esta ocupado, Next.js puede abrir en otro puerto, por ejemplo:

`http://localhost:3001`

## 4. Como hacer cambios en la app

Los archivos mas importantes del proyecto son:

- `app/page.tsx`
  Aqui esta la interfaz principal de la aplicacion.

- `app/globals.css`
  Aqui estan los colores y estilos generales.

- `app/api/...`
  Aqui estan las rutas internas del servidor, por ejemplo login, exportacion a Excel y limpieza de historico.

- `lib/...`
  Aqui estan las utilidades de autenticacion, Supabase y datos del servidor.

### Ejemplos de cambios comunes

#### Cambiar textos

Busca el texto en `app/page.tsx` y editalo.

#### Cambiar colores

Edita las variables y clases en `app/globals.css`.

#### Cambiar logo

Reemplaza la imagen:

`public/creditos-cb-logo.png`

#### Cambiar usuario o clave inicial

Edita estos valores:

- `APP_USERNAME`
- `APP_PASSWORD`

en el archivo `.env.local`

## 5. Como probar antes de subir

### Revisar errores de codigo

```powershell
npm.cmd run lint
```

### Probar compilacion de produccion

```powershell
npm.cmd run build
```

Si ambos comandos terminan bien, normalmente la app ya esta lista para publicarse.

## 6. Como guardar cambios en GitHub

Despues de hacer cambios, usa estos comandos:

```powershell
cd "C:\Users\pc\Documents\Codex\2026-04-19-act-a-como-un-desarrollador-full"
git add .
git commit -m "Describe aqui tu cambio"
git push
```

Ejemplo:

```powershell
git add .
git commit -m "Cambiar colores del panel de clientes"
git push
```

## 7. Como se actualiza Vercel

No necesitas subir manualmente a Vercel cada vez.

Cuando haces:

```powershell
git push
```

Vercel detecta el cambio en GitHub y vuelve a desplegar automaticamente.

Luego de unos segundos o minutos, la nueva version queda publicada en:

`https://creditos-cb.vercel.app`

## 8. Variables importantes de Vercel

En Vercel debes tener configuradas estas variables:

- `APP_USERNAME`
- `APP_PASSWORD`
- `AUTH_SESSION_SECRET`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

Y si usas login real de Supabase, tambien:

- `NEXT_PUBLIC_SUPABASE_LOGIN_EMAIL`
- `NEXT_PUBLIC_SUPABASE_LOGIN_PASSWORD`

## 9. Que cosas dependen de Supabase

Tu proyecto necesita Supabase para:

- clientes
- prestamos
- pagos
- monto inicial compartido
- cambio de clave compartido

Por eso, si cambias algo estructural en la app, tambien puede tocar cambiar SQL en Supabase.

## 10. SQL importantes que ya tienes

Ya dejaste soporte para:

- `configuracion_app`
- `credenciales_app`

Tambien tienes tablas:

- `clientes`
- `prestamos`
- `pagos`

Si en algun momento algo deja de guardar, revisa:

1. que las columnas no hayan cambiado
2. que las politicas RLS sigan activas
3. que las variables de entorno sigan bien

## 11. Exportar respaldo de informacion

Dentro de la app ya existe un boton para descargar Excel con toda la informacion registrada.

Ademas, tu codigo esta protegido por:

- copia local en tu PC
- copia en GitHub
- copia desplegada en Vercel

## 12. Si algun dia no tienes acceso a Pro

Aunque se acabe tu suscripcion, puedes seguir usando el proyecto porque:

- los archivos siguen en tu computador
- el repositorio sigue en GitHub
- el despliegue sigue en Vercel
- la base sigue en Supabase

Lo unico que cambia es que ya no tendras esta ayuda automatica dentro de Codex.

## 13. Flujo recomendado de trabajo

Usa siempre este orden:

1. Abre el proyecto
2. Haz los cambios
3. Prueba con `npm.cmd run lint`
4. Prueba con `npm.cmd run build`
5. Guarda con `git add .`
6. Crea commit con `git commit -m "mensaje"`
7. Publica con `git push`
8. Revisa la version online en Vercel

## 14. Comandos rapidos mas importantes

### Entrar al proyecto

```powershell
cd "C:\Users\pc\Documents\Codex\2026-04-19-act-a-como-un-desarrollador-full"
```

### Iniciar la app

```powershell
npm.cmd run dev
```

### Revisar errores

```powershell
npm.cmd run lint
```

### Compilar produccion

```powershell
npm.cmd run build
```

### Guardar cambios en GitHub

```powershell
git add .
git commit -m "Mi cambio"
git push
```

## 15. Recomendacion final

Antes de hacer cambios grandes:

1. haz `git pull` si trabajas desde otra maquina
2. crea una copia de seguridad del proyecto
3. prueba todo localmente antes de hacer `git push`

Si haces eso, tu proyecto sera mucho mas facil de mantener en el tiempo.
