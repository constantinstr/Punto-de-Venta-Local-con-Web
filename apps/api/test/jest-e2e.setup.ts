// Corre antes de que Jest cargue cada *.e2e-spec.ts (ver "setupFiles" en
// jest-e2e.json) — desactiva el rate limiting (ver AppThrottlerGuard) para
// que la suite pueda crear tenants/usuarios y pegarle a la API tantas veces
// como necesite sin disparar 429 por accidente. auth-security.e2e-spec.ts
// es la excepción deliberada: reactiva el throttling en su propio archivo
// porque necesita probar el 429 real.
process.env.THROTTLE_DISABLE_FOR_TESTS = 'true';
