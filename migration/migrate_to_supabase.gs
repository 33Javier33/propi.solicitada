// ==============================================================================
// SCRIPT DE MIGRACIÓN: Google Sheets → Supabase
// Sistema: propi.solicitada (app de socios)
// ==============================================================================
// NOTA: propi.solicitada no tiene base de datos propia.
// Lee datos de los sistemas:
//   - socios-comicion-propina  → Supabase: teemahksasdougehrcly
//   - diario.propi             → Supabase: lpulmjzboogixbdxxayo
//
// Para migrar los datos, ejecutar los scripts en los repositorios respectivos:
//   - Socios-comicion-propina/migration/migrate_to_supabase.gs
//   - diario.propi/migration/migrate_to_supabase.gs
//
// Este archivo existe solo para documentación del contexto de migración.
// ==============================================================================

function info() {
  Logger.log('propi.solicitada no requiere migración propia.');
  Logger.log('Ver scripts en Socios-comicion-propina y diario.propi.');
}
