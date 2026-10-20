import { Switch, Route } from "wouter";
import { lazy, Suspense } from "react";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/lib/auth";
import Header from "@/components/header";
import Footer from "@/components/footer";
import SalesAgent from "@/components/reign-agent";
import Home from "@/pages/home";
import NotFound from "@/pages/not-found";

const CustomerPortal = lazy(() => import("@/pages/customer-portal"));
const Services = lazy(() => import("@/pages/services"));
const About = lazy(() => import("@/pages/about"));
const FAQ = lazy(() => import("@/pages/faq"));
const Contact = lazy(() => import("@/pages/contact"));
const Admin = lazy(() => import("@/pages/admin"));
const Login = lazy(() => import("@/pages/login"));
const Blog = lazy(() => import("@/pages/blog"));
const BlogPost = lazy(() => import("@/pages/blog-post"));
const Rate = lazy(() => import("@/pages/rate"));

const Gallery = lazy(() => import("@/pages/gallery"));
const CustomTurfInstall = lazy(() => import("@/pages/custom-turf-install"));
const FoundationRepair = lazy(() => import("@/pages/foundation-repair"));
const InteriorRemodeling = lazy(() => import("@/pages/interior-remodeling"));
const OutdoorRemodeling = lazy(() => import("@/pages/outdoor-remodeling"));
const OutdoorLiving = lazy(() => import("@/pages/outdoor-living"));
const TurfAndPavers = lazy(() => import("@/pages/turf-and-pavers"));
const ServiceDetail = lazy(() => import("@/pages/service-detail"));

function PageLoader() {
  return (
    <div className="bg-[#0B0B0D] min-h-screen flex items-center justify-center">
      <div className="w-5 h-5 border-2 border-[#5D3FD3] border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

function Router() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/services" component={Services} />
        <Route path="/about" component={About} />
        <Route path="/faq" component={FAQ} />
        <Route path="/contact" component={Contact} />
        <Route path="/portal" component={CustomerPortal} />
        <Route path="/admin" component={Admin} />
        <Route path="/login" component={Login} />
        <Route path="/blog" component={Blog} />
        <Route path="/blog/:slug" component={BlogPost} />
        <Route path="/rate/:token" component={Rate} />

        <Route path="/gallery" component={Gallery} />
        <Route path="/custom-turf-install" component={CustomTurfInstall} />
        <Route path="/foundation-repair" component={FoundationRepair} />
        <Route path="/interior-remodeling" component={InteriorRemodeling} />
        <Route path="/outdoor-remodeling" component={OutdoorRemodeling} />
        <Route path="/outdoor-living" component={OutdoorLiving} />
        <Route path="/turf-and-pavers" component={TurfAndPavers} />

        <Route path="/:slug" component={ServiceDetail} />

        <Route component={NotFound} />
      </Switch>
    </Suspense>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <div className="grain-overlay" />
          <Header />
          <main>
            <Router />
          </main>
          <Footer />
          <SalesAgent />
          <Toaster />
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
