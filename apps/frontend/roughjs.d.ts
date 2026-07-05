declare module "roughjs" {
  export interface Options {
    stroke?: string;
    strokeWidth?: number;
    fill?: string;
    roughness?: number;
    bowing?: number;
    fillStyle?: string;
    hachureAngle?: number;
    hachureGap?: number;
    curveStepCount?: number;
    simplification?: number;
    strokeLineDash?: number[];
    strokeLineDashOffset?: number;
    fillLineDash?: number[];
    fillLineDashOffset?: number;
    maxRandomnessOffset?: number;
    randomize?: boolean;
    preserveVertices?: boolean;
    seed?: number;
  }

  interface Op {
    op: "move" | "bcurveTo" | "lineTo";
    data: number[];
  }

  interface OpSet {
    type: "path" | "fillPath" | "fillSketch";
    ops: Op[];
    size?: [number, number];
    path?: string;
  }

  interface Drawable {
    shape: string;
    options: Options;
    sets: OpSet[];
  }

  export class RoughCanvas {
    canvas: HTMLCanvasElement;
    ctx: CanvasRenderingContext2D;
    draw(drawable: Drawable): void;
    line(x1: number, y1: number, x2: number, y2: number, options?: Options): Drawable;
    rectangle(x: number, y: number, w: number, h: number, options?: Options): Drawable;
    ellipse(x: number, y: number, w: number, h: number, options?: Options): Drawable;
    circle(x: number, y: number, diameter: number, options?: Options): Drawable;
    linearPath(points: number[][], options?: Options): Drawable;
    arc(x: number, y: number, w: number, h: number, start: number, stop: number, closed?: boolean, options?: Options): Drawable;
    curve(points: number[][], options?: Options): Drawable;
    polygon(points: number[][], options?: Options): Drawable;
    path(d: string, options?: Options): Drawable;
    generator: RoughGenerator;
  }

  class RoughGenerator {
    config: Options;
    line(x1: number, y1: number, x2: number, y2: number, options?: Options): Drawable;
    rectangle(x: number, y: number, w: number, h: number, options?: Options): Drawable;
    ellipse(x: number, y: number, w: number, h: number, options?: Options): Drawable;
    circle(x: number, y: number, diameter: number, options?: Options): Drawable;
    linearPath(points: number[][], options?: Options): Drawable;
    arc(x: number, y: number, w: number, h: number, start: number, stop: number, closed?: boolean, options?: Options): Drawable;
    curve(points: number[][], options?: Options): Drawable;
    polygon(points: number[][], options?: Options): Drawable;
    path(d: string, options?: Options): Drawable;
    toPaths(drawable: Drawable): { d: string; stroke: string; strokeWidth: number; fill: string }[];
  }

  class RoughSVG {
    svg: SVGSVGElement;
    draw(drawable: Drawable): SVGGElement;
    line(x1: number, y1: number, x2: number, y2: number, options?: Options): SVGGElement;
    rectangle(x: number, y: number, w: number, h: number, options?: Options): SVGGElement;
    ellipse(x: number, y: number, w: number, h: number, options?: Options): SVGGElement;
    circle(x: number, y: number, diameter: number, options?: Options): SVGGElement;
    linearPath(points: number[][], options?: Options): SVGGElement;
    polygon(points: number[][], options?: Options): SVGGElement;
    arc(x: number, y: number, w: number, h: number, start: number, stop: number, closed: boolean, options?: Options): SVGGElement;
    curve(points: number[][], options?: Options): SVGGElement;
    path(d: string, options?: Options): SVGGElement;
  }

  interface RoughModule {
    canvas(canvas: HTMLCanvasElement, config?: Options): RoughCanvas;
    svg(svg: SVGSVGElement, config?: Options): RoughSVG;
    generator(config?: Options): RoughGenerator;
    newSeed(): number;
  }

  const rough: RoughModule;
  export default rough;
}
