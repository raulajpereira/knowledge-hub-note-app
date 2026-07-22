import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import logoIcon from '../assets/logo-icon.png';

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    setSubmitting(true);
    try {
      await register(email, password, name);
      navigate('/', { replace: true });
    } catch (err) {
      setError(err.message || 'Could not create your account.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', width: '100%', position: 'relative', overflowY: 'auto', color: '#fff' }}>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'linear-gradient(160deg, oklch(0.32 0.05 250) 0%, oklch(0.24 0.04 260) 45%, oklch(0.16 0.03 280) 100%)',
          backgroundSize: '180% 180%',
          animation: 'kh-login-drift 24s ease-in-out infinite',
        }}
      />
      <div
        style={{
          position: 'relative', minHeight: '100vh', display: 'flex', alignItems: 'center',
          justifyContent: 'center', padding: '40px 6vw',
        }}
      >
        <form
          onSubmit={onSubmit}
          style={{
            width: 400, maxWidth: '100%', background: 'rgba(255,255,255,0.14)',
            backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
            border: '1px solid rgba(255,255,255,0.28)', borderRadius: 22, padding: '34px 30px',
            display: 'flex', flexDirection: 'column', gap: 18, alignItems: 'center', textAlign: 'center',
            boxShadow: '0 30px 80px rgba(0,0,0,0.35)',
          }}
        >
          <img src={logoIcon} alt="" style={{ height: 28, width: 'auto', filter: 'brightness(0) invert(1)' }} />
          <div>
            <div style={{ fontSize: 17, fontWeight: 800 }}>Create your Knowledge Hub</div>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.75)' }}>Your second brain, organized.</div>
          </div>

          {[
            { label: 'Name', value: name, setter: setName, type: 'text', placeholder: 'Your name' },
            { label: 'Email', value: email, setter: setEmail, type: 'email', placeholder: 'you@example.com' },
            { label: 'Password', value: password, setter: setPassword, type: 'password', placeholder: 'At least 8 characters' },
            { label: 'Confirm password', value: confirm, setter: setConfirm, type: 'password', placeholder: 'Repeat password' },
          ].map((f) => (
            <div key={f.label} style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 8, textAlign: 'left' }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.85)' }}>{f.label}</div>
              <input
                value={f.value}
                onChange={(e) => f.setter(e.target.value)}
                type={f.type}
                required
                placeholder={f.placeholder}
                style={{
                  border: 'none', borderRadius: 11, padding: '13px 14px', fontSize: 14,
                  background: 'rgba(255,255,255,0.94)', color: '#1a1a1a', outline: 'none', width: '100%',
                }}
              />
            </div>
          ))}

          {error && (
            <div style={{ fontSize: 12, color: 'oklch(0.8 0.16 25)', fontWeight: 600, alignSelf: 'flex-start' }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            style={{
              background: 'oklch(0.55 0.19 290)', color: '#fff', border: 'none', borderRadius: 11,
              padding: '14px 14px', fontWeight: 700, fontSize: 13.5, letterSpacing: '0.04em',
              textTransform: 'uppercase', cursor: submitting ? 'default' : 'pointer', width: '100%',
              opacity: submitting ? 0.7 : 1,
            }}
          >
            {submitting ? 'Creating account…' : 'Create Account'}
          </button>

          <div style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.75)' }}>
            Already have an account?{' '}
            <Link to="/login" style={{ color: '#fff', fontWeight: 700 }}>
              Sign in
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
