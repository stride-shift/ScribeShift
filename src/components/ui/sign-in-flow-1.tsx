"use client";

import React, { useState, useMemo, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

type Uniforms = {
  [key: string]: {
    value: number[] | number[][] | number;
    type: string;
  };
};

interface ShaderProps {
  source: string;
  uniforms: {
    [key: string]: {
      value: number[] | number[][] | number;
      type: string;
    };
  };
  maxFps?: number;
}

/* ─── Canvas Reveal Effect ───────────────────────────────────── */
export const CanvasRevealEffect = ({
  animationSpeed = 10,
  opacities = [0.3, 0.3, 0.3, 0.5, 0.5, 0.5, 0.8, 0.8, 0.8, 1],
  colors = [[0, 255, 255]],
  containerClassName,
  dotSize,
  showGradient = true,
  reverse = false,
}: {
  animationSpeed?: number;
  opacities?: number[];
  colors?: number[][];
  containerClassName?: string;
  dotSize?: number;
  showGradient?: boolean;
  reverse?: boolean;
}) => {
  return (
    <div className={cn("h-full relative w-full", containerClassName)}>
      <div className="h-full w-full">
        <DotMatrix
          colors={colors ?? [[0, 255, 255]]}
          dotSize={dotSize ?? 3}
          opacities={
            opacities ?? [0.3, 0.3, 0.3, 0.5, 0.5, 0.5, 0.8, 0.8, 0.8, 1]
          }
          shader={`
            ${reverse ? 'u_reverse_active' : 'false'}_;
            animation_speed_factor_${animationSpeed.toFixed(1)}_;
          `}
          center={["x", "y"]}
        />
      </div>
      {showGradient && (
        <div className="absolute inset-0 bg-gradient-to-t from-black to-transparent" />
      )}
    </div>
  );
};

interface DotMatrixProps {
  colors?: number[][];
  opacities?: number[];
  totalSize?: number;
  dotSize?: number;
  shader?: string;
  center?: ("x" | "y")[];
}

const DotMatrix: React.FC<DotMatrixProps> = ({
  colors = [[0, 0, 0]],
  opacities = [0.04, 0.04, 0.04, 0.04, 0.04, 0.08, 0.08, 0.08, 0.08, 0.14],
  totalSize = 20,
  dotSize = 2,
  shader = "",
  center = ["x", "y"],
}) => {
  const uniforms = React.useMemo(() => {
    let colorsArray = [
      colors[0], colors[0], colors[0], colors[0], colors[0], colors[0],
    ];
    if (colors.length === 2) {
      colorsArray = [
        colors[0], colors[0], colors[0], colors[1], colors[1], colors[1],
      ];
    } else if (colors.length === 3) {
      colorsArray = [
        colors[0], colors[0], colors[1], colors[1], colors[2], colors[2],
      ];
    }
    return {
      u_colors: {
        value: colorsArray.map((color) => [
          color[0] / 255, color[1] / 255, color[2] / 255,
        ]),
        type: "uniform3fv",
      },
      u_opacities: { value: opacities, type: "uniform1fv" },
      u_total_size: { value: totalSize, type: "uniform1f" },
      u_dot_size: { value: dotSize, type: "uniform1f" },
      u_reverse: {
        value: shader.includes("u_reverse_active") ? 1 : 0,
        type: "uniform1i",
      },
    };
  }, [colors, opacities, totalSize, dotSize, shader]);

  return (
    <Shader
      source={`
        precision mediump float;
        in vec2 fragCoord;

        uniform float u_time;
        uniform float u_opacities[10];
        uniform vec3 u_colors[6];
        uniform float u_total_size;
        uniform float u_dot_size;
        uniform vec2 u_resolution;
        uniform int u_reverse;

        out vec4 fragColor;

        float PHI = 1.61803398874989484820459;
        float random(vec2 xy) {
            return fract(tan(distance(xy * PHI, xy) * 0.5) * xy.x);
        }
        float map(float value, float min1, float max1, float min2, float max2) {
            return min2 + (value - min1) * (max2 - min2) / (max1 - min1);
        }

        void main() {
            vec2 st = fragCoord.xy;
            ${center.includes("x") ? "st.x -= abs(floor((mod(u_resolution.x, u_total_size) - u_dot_size) * 0.5));" : ""}
            ${center.includes("y") ? "st.y -= abs(floor((mod(u_resolution.y, u_total_size) - u_dot_size) * 0.5));" : ""}

            float opacity = step(0.0, st.x);
            opacity *= step(0.0, st.y);

            vec2 st2 = vec2(int(st.x / u_total_size), int(st.y / u_total_size));

            float frequency = 5.0;
            float show_offset = random(st2);
            float rand = random(st2 * floor((u_time / frequency) + show_offset + frequency));
            opacity *= u_opacities[int(rand * 10.0)];
            opacity *= 1.0 - step(u_dot_size / u_total_size, fract(st.x / u_total_size));
            opacity *= 1.0 - step(u_dot_size / u_total_size, fract(st.y / u_total_size));

            vec3 color = u_colors[int(show_offset * 6.0)];

            float animation_speed_factor = 0.5;
            vec2 center_grid = u_resolution / 2.0 / u_total_size;
            float dist_from_center = distance(center_grid, st2);

            float timing_offset_intro = dist_from_center * 0.01 + (random(st2) * 0.15);
            float max_grid_dist = distance(center_grid, vec2(0.0, 0.0));
            float timing_offset_outro = (max_grid_dist - dist_from_center) * 0.02 + (random(st2 + 42.0) * 0.2);

            float current_timing_offset;
            if (u_reverse == 1) {
                current_timing_offset = timing_offset_outro;
                opacity *= 1.0 - step(current_timing_offset, u_time * animation_speed_factor);
                opacity *= clamp((step(current_timing_offset + 0.1, u_time * animation_speed_factor)) * 1.25, 1.0, 1.25);
            } else {
                current_timing_offset = timing_offset_intro;
                opacity *= step(current_timing_offset, u_time * animation_speed_factor);
                opacity *= clamp((1.0 - step(current_timing_offset + 0.1, u_time * animation_speed_factor)) * 1.25, 1.0, 1.25);
            }

            fragColor = vec4(color, opacity);
            fragColor.rgb *= fragColor.a;
        }`}
      uniforms={uniforms}
      maxFps={60}
    />
  );
};

const ShaderMaterial = ({
  source,
  uniforms,
  maxFps = 60,
}: {
  source: string;
  hovered?: boolean;
  maxFps?: number;
  uniforms: Uniforms;
}) => {
  const { size } = useThree();
  const ref = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    if (!ref.current) return;
    const timestamp = clock.getElapsedTime();
    const material: any = ref.current.material;
    const timeLocation = material.uniforms.u_time;
    timeLocation.value = timestamp;
  });

  const getUniforms = () => {
    const preparedUniforms: any = {};

    for (const uniformName in uniforms) {
      const uniform: any = uniforms[uniformName];

      switch (uniform.type) {
        case "uniform1f":
          preparedUniforms[uniformName] = { value: uniform.value, type: "1f" };
          break;
        case "uniform1i":
          preparedUniforms[uniformName] = { value: uniform.value, type: "1i" };
          break;
        case "uniform3f":
          preparedUniforms[uniformName] = {
            value: new THREE.Vector3().fromArray(uniform.value),
            type: "3f",
          };
          break;
        case "uniform1fv":
          preparedUniforms[uniformName] = { value: uniform.value, type: "1fv" };
          break;
        case "uniform3fv":
          preparedUniforms[uniformName] = {
            value: uniform.value.map((v: number[]) =>
              new THREE.Vector3().fromArray(v)
            ),
            type: "3fv",
          };
          break;
        case "uniform2f":
          preparedUniforms[uniformName] = {
            value: new THREE.Vector2().fromArray(uniform.value),
            type: "2f",
          };
          break;
        default:
          console.error(`Invalid uniform type for '${uniformName}'.`);
          break;
      }
    }

    preparedUniforms["u_time"] = { value: 0, type: "1f" };
    preparedUniforms["u_resolution"] = {
      value: new THREE.Vector2(size.width * 2, size.height * 2),
    };
    return preparedUniforms;
  };

  const material = useMemo(() => {
    const materialObject = new THREE.ShaderMaterial({
      vertexShader: `
      precision mediump float;
      in vec2 coordinates;
      uniform vec2 u_resolution;
      out vec2 fragCoord;
      void main(){
        float x = position.x;
        float y = position.y;
        gl_Position = vec4(x, y, 0.0, 1.0);
        fragCoord = (position.xy + vec2(1.0)) * 0.5 * u_resolution;
        fragCoord.y = u_resolution.y - fragCoord.y;
      }
      `,
      fragmentShader: source,
      uniforms: getUniforms(),
      glslVersion: THREE.GLSL3,
      blending: THREE.CustomBlending,
      blendSrc: THREE.SrcAlphaFactor,
      blendDst: THREE.OneFactor,
    });

    return materialObject;
  }, [size.width, size.height, source]);

  return (
    <mesh ref={ref as any}>
      <planeGeometry args={[2, 2]} />
      <primitive object={material} attach="material" />
    </mesh>
  );
};

const Shader: React.FC<ShaderProps> = ({ source, uniforms, maxFps = 60 }) => {
  return (
    <Canvas className="absolute inset-0 h-full w-full">
      <ShaderMaterial source={source} uniforms={uniforms} maxFps={maxFps} />
    </Canvas>
  );
};

/* ─── Props ──────────────────────────────────────────────────── */
export interface SignInPageProps {
  className?: string;
  mode: "login" | "signup" | "reset";
  email: string;
  password: string;
  fullName: string;
  companyName: string;
  error: string;
  success: string;
  loading: boolean;
  onEmailChange: (v: string) => void;
  onPasswordChange: (v: string) => void;
  onFullNameChange: (v: string) => void;
  onCompanyNameChange: (v: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  onModeChange: (m: "login" | "signup" | "reset") => void;
  onGoogleSignIn?: () => void;
}

/* ─── Main SignInPage ───────────────────────────────────────── */
export const SignInPage: React.FC<SignInPageProps> = ({
  className, mode, email, password, fullName, companyName,
  error, success, loading,
  onEmailChange, onPasswordChange, onFullNameChange, onCompanyNameChange,
  onSubmit, onModeChange, onGoogleSignIn,
}) => {
  const [initialCanvasVisible, setInitialCanvasVisible] = useState(true);
  const [reverseCanvasVisible, setReverseCanvasVisible] = useState(false);
  const [cursor, setCursor] = useState({ x: -1000, y: -1000 });
  const [cursorVisible, setCursorVisible] = useState(false);

  // Trigger reverse canvas on success
  useEffect(() => {
    if (success) {
      setReverseCanvasVisible(true);
      setTimeout(() => setInitialCanvasVisible(false), 50);
    }
  }, [success]);

  // Track mouse for spotlight cursor effect
  useEffect(() => {
    const handleMove = (e: MouseEvent) => {
      setCursor({ x: e.clientX, y: e.clientY });
      if (!cursorVisible) setCursorVisible(true);
    };
    const handleLeave = () => setCursorVisible(false);
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseleave", handleLeave);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseleave", handleLeave);
    };
  }, [cursorVisible]);

  const headline =
    mode === "login" ? "Welcome back" :
    mode === "signup" ? "Create your account" :
    "Reset your password";

  const subline =
    mode === "login" ? "Sign in to ScribeShift" :
    mode === "signup" ? "Get started with ScribeShift" :
    "Enter your email to receive a reset link";

  const submitLabel =
    mode === "login" ? "Sign In" :
    mode === "signup" ? "Create Account" :
    "Send Reset Link";

  return (
    <div className={cn("flex w-[100%] flex-col min-h-screen bg-black relative", className)}>
      {/* Animated dot canvas background */}
      <div className="absolute inset-0 z-0">
        {initialCanvasVisible && (
          <div className="absolute inset-0">
            <CanvasRevealEffect
              animationSpeed={3}
              containerClassName="bg-black"
              colors={[
                [59, 130, 246],
                [96, 165, 250],
              ]}
              dotSize={6}
              reverse={false}
            />
          </div>
        )}

        {reverseCanvasVisible && (
          <div className="absolute inset-0">
            <CanvasRevealEffect
              animationSpeed={4}
              containerClassName="bg-black"
              colors={[
                [59, 130, 246],
                [96, 165, 250],
              ]}
              dotSize={6}
              reverse={true}
            />
          </div>
        )}

        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_rgba(0,0,0,1)_0%,_transparent_100%)]" />
        <div className="absolute top-0 left-0 right-0 h-1/3 bg-gradient-to-b from-black to-transparent" />
      </div>

      {/* Cursor spotlight glow — follows the mouse */}
      <div
        className="pointer-events-none fixed inset-0 z-[5] transition-opacity duration-300"
        style={{
          opacity: cursorVisible ? 1 : 0,
          background: `radial-gradient(circle 320px at ${cursor.x}px ${cursor.y}px, rgba(59,130,246,0.18), rgba(96,165,250,0.08) 40%, transparent 70%)`,
        }}
      />

      {/* Cursor inner glow dot */}
      <div
        className="pointer-events-none fixed z-[6] rounded-full transition-opacity duration-300"
        style={{
          left: cursor.x - 12,
          top: cursor.y - 12,
          width: 24,
          height: 24,
          opacity: cursorVisible ? 1 : 0,
          background: "radial-gradient(circle, rgba(96,165,250,0.6), transparent 70%)",
          filter: "blur(8px)",
        }}
      />

      {/* Content layer */}
      <div className="relative z-10 flex flex-col flex-1">
        {/* Form area */}
        <div className="flex flex-1 flex-col justify-center items-center px-4">
          <div className="w-full max-w-sm">
            <AnimatePresence mode="wait">
              {!success ? (
                <motion.div
                  key="form-step"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  transition={{ duration: 0.4, ease: "easeOut" }}
                  className="space-y-6 text-center"
                >
                  {/* Big brand logo right above the headline */}
                  <div className="flex flex-col items-center gap-3">
                    <svg width="72" height="72" viewBox="0 0 44 44" fill="none">
                      <defs>
                        <linearGradient id="signInLogo" x1="0" y1="0" x2="44" y2="44">
                          <stop offset="0%" stopColor="#3b82f6" />
                          <stop offset="100%" stopColor="#2563eb" />
                        </linearGradient>
                      </defs>
                      <circle cx="22" cy="22" r="20" stroke="url(#signInLogo)" strokeWidth="2.5" />
                      <circle cx="22" cy="22" r="7" fill="url(#signInLogo)" />
                    </svg>
                    <span className="text-4xl font-bold tracking-tight text-blue-400">ScribeShift</span>
                  </div>

                  <div className="space-y-1">
                    <h1 className="text-[2.25rem] font-bold leading-[1.1] tracking-tight text-white">{headline}</h1>
                    <p className="text-[1rem] text-white/60 font-light">{subline}</p>
                  </div>

                  <form onSubmit={onSubmit} className="space-y-3">
                    {mode === "signup" && (
                      <>
                        <input
                          type="text"
                          placeholder="Full name"
                          value={fullName}
                          onChange={(e) => onFullNameChange(e.target.value)}
                          autoComplete="name"
                          className="w-full backdrop-blur-[1px] text-white border border-white/10 rounded-full py-3 px-5 focus:outline-none focus:border-white/30 text-center bg-white/5"
                        />
                        <input
                          type="text"
                          placeholder="Company (optional)"
                          value={companyName}
                          onChange={(e) => onCompanyNameChange(e.target.value)}
                          autoComplete="organization"
                          className="w-full backdrop-blur-[1px] text-white border border-white/10 rounded-full py-3 px-5 focus:outline-none focus:border-white/30 text-center bg-white/5"
                        />
                      </>
                    )}

                    <input
                      type="email"
                      placeholder="you@example.com"
                      value={email}
                      onChange={(e) => onEmailChange(e.target.value)}
                      required
                      autoComplete="email"
                      className="w-full backdrop-blur-[1px] text-white border border-white/10 rounded-full py-3 px-5 focus:outline-none focus:border-white/30 text-center bg-white/5"
                    />

                    {mode !== "reset" && (
                      <input
                        type="password"
                        placeholder="Password"
                        value={password}
                        onChange={(e) => onPasswordChange(e.target.value)}
                        required
                        autoComplete={mode === "login" ? "current-password" : "new-password"}
                        className="w-full backdrop-blur-[1px] text-white border border-white/10 rounded-full py-3 px-5 focus:outline-none focus:border-white/30 text-center bg-white/5"
                      />
                    )}

                    {mode === "login" && (
                      <div className="flex justify-center">
                        <button
                          type="button"
                          onClick={() => onModeChange("reset")}
                          className="text-xs text-white/50 hover:text-white/80 transition-colors"
                        >
                          Forgot password?
                        </button>
                      </div>
                    )}

                    {error && (
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-full px-4 py-2"
                      >
                        {error}
                      </motion.div>
                    )}

                    <motion.button
                      type="submit"
                      disabled={loading}
                      className="w-full rounded-full bg-white text-black font-medium py-3 hover:bg-white/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      whileHover={{ scale: loading ? 1 : 1.02 }}
                      whileTap={{ scale: loading ? 1 : 0.98 }}
                    >
                      {loading ? "Please wait..." : submitLabel}
                    </motion.button>

                    {/* Google Sign In — only show on login/signup, not reset */}
                    {mode !== "reset" && onGoogleSignIn && (
                      <>
                        <div className="relative flex items-center my-1">
                          <div className="flex-1 border-t border-white/10" />
                          <span className="px-3 text-xs text-white/40">or</span>
                          <div className="flex-1 border-t border-white/10" />
                        </div>
                        <motion.button
                          type="button"
                          onClick={onGoogleSignIn}
                          disabled={loading}
                          className="w-full rounded-full bg-white/[0.06] text-white font-medium py-3 border border-white/15 hover:bg-white/[0.1] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                          whileHover={{ scale: loading ? 1 : 1.02 }}
                          whileTap={{ scale: loading ? 1 : 0.98 }}
                        >
                          <svg width="18" height="18" viewBox="0 0 48 48">
                            <path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z" />
                            <path fill="#FF3D00" d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z" />
                            <path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238A11.91 11.91 0 0 1 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z" />
                            <path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303a12.04 12.04 0 0 1-4.087 5.571l.003-.002 6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z" />
                          </svg>
                          Continue with Google
                        </motion.button>
                      </>
                    )}
                  </form>

                  {/* Mode switcher */}
                  <div className="text-sm text-white/50">
                    {mode === "login" ? (
                      <>
                        Don't have an account?{" "}
                        <button
                          onClick={() => onModeChange("signup")}
                          className="text-white font-medium hover:underline"
                        >
                          Sign up
                        </button>
                      </>
                    ) : (
                      <>
                        {mode === "reset" ? "Remember your password? " : "Already have an account? "}
                        <button
                          onClick={() => onModeChange("login")}
                          className="text-white font-medium hover:underline"
                        >
                          Sign in
                        </button>
                      </>
                    )}
                  </div>

                </motion.div>
              ) : (
                <motion.div
                  key="success-step"
                  initial={{ opacity: 0, y: 50 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, ease: "easeOut", delay: 0.3 }}
                  className="space-y-6 text-center"
                >
                  <div className="space-y-1">
                    <h1 className="text-[2.5rem] font-bold leading-[1.1] tracking-tight text-white">
                      {mode === "reset" ? "Check your email" : "You're in!"}
                    </h1>
                    <p className="text-[1.25rem] text-white/60 font-light">{success}</p>
                  </div>

                  <motion.div
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ duration: 0.5, delay: 0.5 }}
                    className="py-10"
                  >
                    <div className="mx-auto w-16 h-16 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="h-8 w-8 text-white"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                      >
                        <path
                          fillRule="evenodd"
                          d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                          clipRule="evenodd"
                        />
                      </svg>
                    </div>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Bottom footer — bigger powered-by */}
        <div className="pb-10 flex justify-center">
          <p className="text-base text-white/60">
            Powered by{" "}
            <a
              href="https://www.strideshift.ai/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-400 hover:text-blue-300 font-semibold transition-colors"
            >
              StrideShift Global
            </a>
          </p>
        </div>
      </div>
    </div>
  );
};
