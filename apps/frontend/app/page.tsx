import { Button } from "../../../packages/ui/button";
import { Card } from "../../../packages/ui/card";
import {
  Pencil,
  Share2,
  Users2,
  Sparkles,
  Github,
  Download,
} from "lucide-react";
import Link from "next/link";

function App() {
  return (
    <div className="min-h-screen bg-background">
      {/* Hero Section */}
      <header className="overflow-hidden relative">
        <div className="container py-16 px-4 mx-auto sm:px-6 lg:px-8">
          <div className="text-center">
            <h1 className="text-4xl font-bold tracking-tight sm:text-6xl text-foreground">
              Collaborative Whiteboarding
              <span className="block text-primary">Made Simple</span>
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">
              Create, collaborate, and share beautiful diagrams and sketches
              with our intuitive drawing tool. No sign-up required.
            </p>
            <div className="flex gap-x-6 justify-center items-center mt-10">
              <Link href={"/signin"}>
                <Button variant={"primary"} size="lg" className="px-6 h-12">
                  Sign in
                  <Pencil className="ml-2 w-4 h-4" />
                </Button>
              </Link>
              <Link href="/signup">
                <Button variant="outline" size="lg" className="px-6 h-12">
                  Sign up
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </header>

      {/* Features Section */}
      <section className="py-24 bg-muted/50">
        <div className="container px-4 mx-auto sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 gap-12 sm:grid-cols-2 lg:grid-cols-3">
            <Card className="p-6 border-2 transition-colors hover:border-primary">
              <div className="flex gap-4 items-center">
                <div className="p-2 rounded-lg bg-primary/10">
                  <Share2 className="w-6 h-6 text-primary" />
                </div>
                <h3 className="text-xl font-semibold">
                  Real-time Collaboration
                </h3>
              </div>
              <p className="mt-4 text-muted-foreground">
                Work together with your team in real-time. Share your drawings
                instantly with a simple link.
              </p>
            </Card>

            <Card className="p-6 border-2 transition-colors hover:border-primary">
              <div className="flex gap-4 items-center">
                <div className="p-2 rounded-lg bg-primary/10">
                  <Users2 className="w-6 h-6 text-primary" />
                </div>
                <h3 className="text-xl font-semibold">Multiplayer Editing</h3>
              </div>
              <p className="mt-4 text-muted-foreground">
                Multiple users can edit the same canvas simultaneously. See
                who's drawing what in real-time.
              </p>
            </Card>

            <Card className="p-6 border-2 transition-colors hover:border-primary">
              <div className="flex gap-4 items-center">
                <div className="p-2 rounded-lg bg-primary/10">
                  <Sparkles className="w-6 h-6 text-primary" />
                </div>
                <h3 className="text-xl font-semibold">Smart Drawing</h3>
              </div>
              <p className="mt-4 text-muted-foreground">
                Intelligent shape recognition and drawing assistance helps you
                create perfect diagrams.
              </p>
            </Card>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24">
        <div className="container px-4 mx-auto sm:px-6 lg:px-8">
          <div className="p-8 rounded-3xl sm:p-16 bg-primary">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="text-3xl font-bold tracking-tight sm:text-4xl text-primary-foreground">
                Ready to start creating?
              </h2>
              <p className="mx-auto mt-6 max-w-xl text-lg text-primary-foreground/80">
                Join thousands of users who are already creating amazing
                diagrams and sketches.
              </p>
              <div className="flex gap-x-6 justify-center items-center mt-10">
                <Button size="lg" variant="secondary" className="px-6 h-12">
                  Open Canvas
                  <Pencil className="ml-2 w-4 h-4" />
                </Button>
                <Button
                  variant="outline"
                  size="lg"
                  className="px-6 h-12 bg-transparent text-primary-foreground border-primary-foreground hover:bg-primary-foreground hover:text-primary"
                >
                  View Gallery
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t">
        <div className="container py-12 px-4 mx-auto sm:px-6 lg:px-8">
          <div className="flex flex-col gap-6 justify-between items-center sm:flex-row">
            <p className="text-sm text-muted-foreground">
              © 2024 Excalidraw Clone. All rights reserved.
            </p>
            <div className="flex space-x-6">
              <a
                href="https://github.com"
                className="text-muted-foreground hover:text-primary"
              >
                <Github className="w-5 h-5" />
              </a>
              <a href="#" className="text-muted-foreground hover:text-primary">
                <Download className="w-5 h-5" />
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default App;
