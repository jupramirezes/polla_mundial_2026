import Link from 'next/link';
import { SignupForm } from './SignupForm';

export default function SignupPage() {
  return (
    <main className="flex-1 flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <Link href="/" className="text-4xl">⚽</Link>
          <h1 className="text-2xl font-bold mt-2">Crear cuenta</h1>
          <p className="text-sm text-slate-600">Polla Mundial 2026</p>
        </div>

        <SignupForm />

        <p className="text-sm text-center text-slate-600 mt-6">
          ¿Ya tienes cuenta?{' '}
          <Link href="/login" className="font-medium text-slate-900 underline">
            Entrar
          </Link>
        </p>
      </div>
    </main>
  );
}
