import Navbar            from '@/components/landing/Navbar';
import HeroSection       from '@/components/landing/HeroSection';
import AboutSection      from '@/components/landing/AboutSection';
import HowItWorksSection from '@/components/landing/HowItWorksSection';
import ImpactSection     from '@/components/landing/ImpactSection';
import Footer            from '@/components/landing/Footer';

export default function LandingPage() {
  return (
    <>
      <Navbar />
      <main>
        <HeroSection />
        <AboutSection />
        <HowItWorksSection />
        <ImpactSection />
      </main>
      <Footer />
    </>
  );
}
