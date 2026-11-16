import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import Hero from './components/Hero';
import WhyChooseLanzy from './components/WhyChooseLanzy';
import Categories from './components/Categories';
import HowItWorks from './components/HowItWorks';
import FeaturedDesigners from './components/FeaturedDesigners';
import Testimonials from './components/Testimonials';
import Statistics from './components/Statistics';
import CTASection from './components/CTASection';
import Footer from './components/Footer';
import ScrollToTop from './components/ScrollToTop';
import InfoModals from './components/InfoModals';
import Login from './pages/Login';
import Register from './pages/Register';
import ForgotPassword from './pages/ForgotPassword';
import Dashboard from './pages/Dashboard';
import Designers from './pages/Designers';
import Freelancers from './pages/Freelancers';
import Projects from './pages/Projects';
import DesignerProfile from './pages/DesignerProfile';
import AddProject from './pages/AddProject';
import MyProjects from './pages/MyProjects';
import Chat from './pages/Chat';
import AdminDashboard from './pages/AdminDashboard';
import AnalyticsDashboard from './pages/AnalyticsDashboard';
import DashboardRequests from './pages/DashboardRequests';
import { ProtectedRoute } from './components/ProtectedRoute';
import PageTransition from './components/PageTransition';
import { TeknTandaoServices, TeknTandaoDashboard } from './pages/TeknTandaoManaged';

function Home() {
  return <div className="relative min-h-screen bg-white text-neutral-900 antialiased">
    <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-950 px-5 py-3 text-sm text-white">
      <span className="font-semibold">TeknTandao Global Services — managed technology outsourcing</span>
      <Link className="font-bold text-blue-200 underline" to="/services">Explore managed services →</Link>
    </div>
    <Hero /><WhyChooseLanzy /><Categories /><HowItWorks /><FeaturedDesigners />
    <Testimonials /><Statistics /><CTASection /><Footer /><ScrollToTop /><InfoModals />
  </div>;
}

export default function App() {
  return <ThemeProvider><AuthProvider><Router><Routes>
    <Route path="/" element={<PageTransition><Home /></PageTransition>} />
    <Route path="/services" element={<TeknTandaoServices />} />
    <Route path="/managed" element={<ProtectedRoute><TeknTandaoDashboard /></ProtectedRoute>} />
    <Route path="/login" element={<PageTransition><Login /></PageTransition>} />
    <Route path="/register" element={<PageTransition><Register /></PageTransition>} />
    <Route path="/forgot-password" element={<ForgotPassword />} />
    <Route path="/designers" element={<PageTransition><Designers /></PageTransition>} />
    <Route path="/freelancers" element={<PageTransition><Freelancers /></PageTransition>} />
    <Route path="/projects" element={<PageTransition><Projects /></PageTransition>} />
    <Route path="/designer/:id" element={<PageTransition><DesignerProfile /></PageTransition>} />
    <Route path="/freelancer/:id" element={<PageTransition><DesignerProfile /></PageTransition>} />
    <Route path="/dashboard" element={<ProtectedRoute><PageTransition><Dashboard /></PageTransition></ProtectedRoute>} />
    <Route path="/dashboard/analytics" element={<ProtectedRoute><PageTransition><AnalyticsDashboard /></PageTransition></ProtectedRoute>} />
    <Route path="/admin" element={<ProtectedRoute><PageTransition><AdminDashboard /></PageTransition></ProtectedRoute>} />
    <Route path="/dashboard/requests" element={<ProtectedRoute><DashboardRequests /></ProtectedRoute>} />
    <Route path="/add-project" element={<ProtectedRoute><AddProject /></ProtectedRoute>} />
    <Route path="/my-projects" element={<ProtectedRoute><MyProjects /></ProtectedRoute>} />
    <Route path="/chat" element={<ProtectedRoute><Chat /></ProtectedRoute>} />
    <Route path="/chat/:receiverId" element={<ProtectedRoute><Chat /></ProtectedRoute>} />
  </Routes></Router></AuthProvider></ThemeProvider>;
}
