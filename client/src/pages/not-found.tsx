import { Button } from "@/components/ui/button";
import { Heart, Home } from "lucide-react";
import { useLocation } from "wouter";

export default function NotFound() {
  const [, setLocation] = useLocation();
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-background gap-6">
      <div className="w-16 h-16 bg-primary/10 rounded-3xl flex items-center justify-center">
        <Heart className="h-8 w-8 text-primary" />
      </div>
      <div className="text-center">
        <h1 className="text-4xl font-bold text-foreground">404</h1>
        <p className="text-muted-foreground mt-2">This page could not be found.</p>
      </div>
      <Button onClick={() => setLocation("/")} className="gap-2">
        <Home className="h-4 w-4" /> Back to Dashboard
      </Button>
    </div>
  );
}
