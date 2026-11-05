import { lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { LandingPage } from './views/LandingPage';
import { ScrollToTop } from './components/ScrollToTop';

const PropertyDetail = lazy(() => import('./views/PropertyDetail').then(m => ({ default: m.PropertyDetail })));
const AdminPanel = lazy(() => import('./views/AdminPanel').then(m => ({ default: m.AdminPanel })));
const QuienesSomos = lazy(() => import('./views/QuienesSomos').then(m => ({ default: m.QuienesSomos })));
const FAQ = lazy(() => import('./views/FAQ').then(m => ({ default: m.FAQ })));
const Contacto = lazy(() => import('./views/Contacto').then(m => ({ default: m.Contacto })));
const NotFound = lazy(() => import('./views/NotFound').then(m => ({ default: m.NotFound })));

const RouteFallback = () => (
  <div className="min-h-screen flex items-center justify-center bg-crema">
    <div className="w-10 h-10 rounded-full border-4 border-sand border-t-primary animate-spin" />
  </div>
);

function App() {
  return (
    <Router>
      <ScrollToTop />
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/inmueble/:slug" element={<PropertyDetail />} />
          <Route path="/admin" element={<AdminPanel />} />
          <Route path="/quienes-somos" element={<QuienesSomos />} />
          <Route path="/guia" element={<FAQ />} />
          <Route path="/contacto" element={<Contacto />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </Router>
  );
}

export default App;
