# Reglas y Pautas del Proyecto (IPSchedullingManager)

## 1. Envío de Emails y Pruebas
- **NUNCA enviar emails reales** desde scripts de prueba, comandos curl o herramientas automáticas cuando algo falle o se esté depurando.
- El asistente debe limitarse a reparar y corregir el código/configuración, sin ejecutar envíos reales de prueba.
- Las pruebas de envío reales las realiza exclusivamente el USUARIO en su entorno.

## 2. Migraciones de Base de Datos
- **NUNCA modificar migraciones existentes** en `supabase/migrations/` ni alterar archivos históricos de migración.
- Cualquier cambio, alteración de esquema o nueva tabla/columna debe realizarse creando una **nueva migración** con su timestamp correspondiente.

## 3. Verificación de UI y Navegador
- **NUNCA usar herramientas de navegador automatizado ni abrir el navegador** para verificar la interfaz, flujos o páginas.
- Siempre pedir al USUARIO que sea él quien verifique en su propio navegador local.

## 4. Política de Git
- **NUNCA realizar git commit automáticamente**. Los commits los gestiona y ejecuta el usuario.
