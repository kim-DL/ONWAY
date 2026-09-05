import { cn } from "./cn";
import styles from "./quantum-cloud-loader.module.css";

interface QuantumCloudLoaderProps {
  paused?: boolean;
  className?: string;
}

const particles = (
  <>
    <span className={cn(styles.particle, styles.coral)} data-quantum-particle="coral">
      <span className={styles.core} />
    </span>
    <span className={cn(styles.particle, styles.blue)} data-quantum-particle="blue">
      <span className={styles.core} />
    </span>
    <span className={cn(styles.particle, styles.champagne)} data-quantum-particle="champagne">
      <span className={styles.core} />
    </span>
    <span className={cn(styles.particle, styles.sage)} data-quantum-particle="sage">
      <span className={styles.core} />
    </span>
  </>
);

/** Ambient artwork based on the supplied Quantum Cloud reference, not a loading state. */
export function QuantumCloudLoader({ paused = true, className }: QuantumCloudLoaderProps) {
  return (
    <span
      className={cn(styles.cloud, className)}
      data-quantum-cloud
      data-motion={paused ? "paused" : "running"}
      aria-hidden="true"
    >
      {particles}
    </span>
  );
}
