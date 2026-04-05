'use client';

/**
 * app/(embedded)/products/[sku]/page.tsx
 *
 * Full product detail page — loaded from GET /store/catalog/{sku}.
 *
 * Currently accessible only for products already in the store's active
 * Shopify catalog (the backend endpoint 404s for unsynced products).
 * Once the backend extends the endpoint, this same page will be linked
 * from the "Available to Add" tab as well.
 */

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  Page,
  Card,
  BlockStack,
  InlineStack,
  Text,
  Badge,
  Button,
  Banner,
  Divider,
  Box,
  Spinner,
  SkeletonPage,
  SkeletonBodyText,
  DataTable,
} from '@shopify/polaris';
import { useQuery } from '@tanstack/react-query';
import { getProductDetail } from '@/lib/api/products';
import { useMerchantContext } from '@/hooks/useMerchantContext';
import { ApiError } from '@/lib/api/client';
import type { ProductDetailResponse, ProductDetailVariant } from '@/types/api';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatPrice(price: string | null | undefined): string {
  if (!price) return '—';
  const n = parseFloat(price);
  return isNaN(n) ? '—' : `$${n.toFixed(2)}`;
}

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return 'Never';
  return new Date(iso).toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function estMargin(cost: string | null, list: string | null): string {
  if (!cost || !list) return '—';
  const c = parseFloat(cost), l = parseFloat(list);
  if (isNaN(c) || isNaN(l) || l === 0) return '—';
  return `${Math.round(((l - c) / l) * 100)}%`;
}

/** Convert a Shopify GID to a numeric admin product URL */
function shopifyAdminUrl(shopDomain: string | undefined, gid: string | null): string | null {
  if (!gid || !shopDomain) return null;
  const numericId = gid.split('/').pop();
  if (!numericId) return null;
  return `https://${shopDomain}/admin/products/${numericId}`;
}

// ---------------------------------------------------------------------------
// Tag helpers (same maps as in products/page.tsx)
// ---------------------------------------------------------------------------

const BARE_NOTICE_TAGS: Record<string, { label: string; tone: 'critical' | 'warning' | 'attention' | 'success' | 'info' }> = {
  'hazmat':               { label: 'Hazmat',                 tone: 'critical'  },
  'prop65:ca-restricted': { label: 'Prop 65 CA restricted',  tone: 'warning'   },
  'non-returnable':       { label: 'Non-returnable',         tone: 'attention' },
  'new-arrival':          { label: 'New arrival',            tone: 'success'   },
};

const MARKETPLACE_NOTICE_TAGS: Record<string, { label: string; tone: 'critical' | 'warning' | 'attention' }> = {
  'prohibited':      { label: 'Restricted',  tone: 'critical'  },
  'no-amazon':       { label: 'No Amazon',   tone: 'attention' },
  'authorized-only': { label: 'Auth only',   tone: 'attention' },
};

const STOCK_STATUS_TAGS: Record<string, { label: string; tone: 'warning' | 'info' }> = {
  'limited':  { label: 'Limited stock', tone: 'warning' },
  'preorder': { label: 'Preorder',      tone: 'info'    },
};

function getTagsByNamespace(tags: string[], ns: string): string[] {
  return tags.filter(t => t.startsWith(`${ns}:`)).map(t => t.slice(ns.length + 1));
}

function ProductTagBadges({ tags }: { tags: string[] }) {
  if (tags.length === 0) return null;
  const badges: React.ReactNode[] = [];
  for (const [tag, cfg] of Object.entries(BARE_NOTICE_TAGS)) {
    if (tags.includes(tag)) badges.push(<Badge key={tag} tone={cfg.tone}>{cfg.label}</Badge>);
  }
  for (const mkt of getTagsByNamespace(tags, 'marketplace')) {
    const cfg = MARKETPLACE_NOTICE_TAGS[mkt];
    if (cfg) badges.push(<Badge key={`mp-${mkt}`} tone={cfg.tone}>{cfg.label}</Badge>);
  }
  for (const st of getTagsByNamespace(tags, 'stock-status')) {
    const cfg = STOCK_STATUS_TAGS[st];
    if (cfg) badges.push(<Badge key={`ss-${st}`} tone={cfg.tone}>{cfg.label}</Badge>);
  }
  if (badges.length === 0) return null;
  return <InlineStack gap="200" blockAlign="center">{badges}</InlineStack>;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function LoadingSkeleton() {
  return (
    <SkeletonPage title="Loading product…" backAction>
      <BlockStack gap="400">
        <Card><SkeletonBodyText lines={4} /></Card>
        <Card><SkeletonBodyText lines={6} /></Card>
        <Card><SkeletonBodyText lines={3} /></Card>
      </BlockStack>
    </SkeletonPage>
  );
}

/** Renders the product image gallery. Shows a placeholder if no images. */
function ImageGallery({ images, imageUrl }: { images: ProductDetailResponse['images']; imageUrl?: string | null }) {
  const [selected, setSelected] = useState(0);

  // Fall back to the single image_url when the full images array is empty
  const resolvedImages: ProductDetailResponse['images'] =
    images.length > 0
      ? images
      : imageUrl
        ? [{ url: imageUrl, alt: null, position: 0 }]
        : [];

  if (resolvedImages.length === 0) {
    return (
      <Box
        background="bg-surface-secondary"
        borderRadius="200"
        minHeight="220px"
        padding="400"
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '220px' }}>
          <Text as="p" tone="subdued">No images available</Text>
        </div>
      </Box>
    );
  }

  const primary = resolvedImages[selected] ?? resolvedImages[0];

  return (
    <BlockStack gap="300">
      {/* Primary image */}
      <Box borderRadius="200" background="bg-surface-secondary" padding="200">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={primary.url}
          alt={primary.alt ?? ''}
          style={{ width: '100%', maxHeight: '280px', objectFit: 'contain', display: 'block', borderRadius: '4px' }}
        />
      </Box>

      {/* Thumbnail strip — only if >1 image */}
      {resolvedImages.length > 1 && (
        <InlineStack gap="200" wrap>
          {resolvedImages.map((img, i) => (
            <button
              key={i}
              onClick={() => setSelected(i)}
              style={{
                padding: 0, border: `2px solid ${i === selected ? 'var(--p-color-border-emphasis)' : 'transparent'}`,
                borderRadius: '6px', cursor: 'pointer', background: 'none', lineHeight: 0,
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={img.url}
                alt={img.alt ?? `Image ${i + 1}`}
                style={{ width: '60px', height: '60px', objectFit: 'contain', borderRadius: '4px', display: 'block' }}
              />
            </button>
          ))}
        </InlineStack>
      )}
    </BlockStack>
  );
}

/** Core identity + pricing info panel */
function ProductInfoPanel({ product }: { product: ProductDetailResponse }) {
  const typeLabel = product.product_type === 'retail' ? 'Warehouse' : product.product_type === 'vds' ? 'Dropship' : null;
  const typeTone = product.product_type === 'retail' ? ('info' as const) : product.product_type === 'vds' ? ('warning' as const) : undefined;
  const shopifyStatus = product.last_shopify_status?.toUpperCase() ?? null;

  const categoryParts = [product.category_1, product.category_2, product.category_3].filter(Boolean);

  return (
    <BlockStack gap="300">
      {/* Name */}
      <Text as="h1" variant="headingLg" fontWeight="bold">{product.product_name ?? product.aoa_sku}</Text>

      {/* Type + status badges */}
      <InlineStack gap="200" blockAlign="center" wrap>
        {typeLabel && typeTone && <Badge tone={typeTone}>{typeLabel}</Badge>}
        {product.in_shopify && shopifyStatus ? (
          <Badge tone={shopifyStatus === 'ACTIVE' ? 'success' : undefined}>
            {shopifyStatus.charAt(0) + shopifyStatus.slice(1).toLowerCase()}
          </Badge>
        ) : product.in_shopify ? (
          <Badge tone="attention">In Shopify</Badge>
        ) : null}
        <ProductTagBadges tags={product.tags} />
      </InlineStack>

      {/* Category breadcrumb */}
      {categoryParts.length > 0 && (
        <Text as="p" tone="subdued" variant="bodySm">{categoryParts.join(' › ')}</Text>
      )}

      <Divider />

      {/* Key fields grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem 1.5rem' }}>
        <LabelValue label="SKU" value={product.aoa_sku} />
        {product.brand && <LabelValue label="Brand" value={product.brand} />}
        {product.manufacturer && product.manufacturer !== product.brand && (
          <LabelValue label="Manufacturer" value={product.manufacturer} />
        )}
        {product.upc && <LabelValue label="UPC" value={product.upc} />}
        {product.shipping_profile_key && (
          <LabelValue
            label="Fulfillment"
            value={product.shipping_profile_key === 'warehouse' ? 'Warehouse' : product.shipping_profile_key === 'dropship' ? 'Dropship' : product.shipping_profile_key}
          />
        )}
        {product.country_of_origin && <LabelValue label="Origin" value={product.country_of_origin} />}
      </div>

      <Divider />

      {/* Pricing row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr 1fr', gap: '0.5rem 1rem' }}>
        <LabelValue label="Your cost" value={formatPrice(product.merchant_cost)} highlight />
        <LabelValue label="List price" value={formatPrice(product.list_price)} />
        <LabelValue
          label="Your price (Shopify)"
          value={formatPrice(product.your_price ?? product.list_price)}
          highlight
          subText={
            product.map_price
              ? `MAP: ${formatPrice(product.map_price)}${product.below_map ? ' — below MAP' : ''}`
              : undefined
          }
          warning={product.below_map}
        />
        <LabelValue label="Est. margin" value={estMargin(product.merchant_cost, product.your_price ?? product.list_price)} />
        <LabelValue label="In-stock qty" value={product.catalog_quantity != null ? product.catalog_quantity.toLocaleString() : '—'} />
      </div>
    </BlockStack>
  );
}

function LabelValue({ label, value, highlight, subText, warning }: {
  label: string;
  value: string;
  highlight?: boolean;
  /** Secondary line shown below the value in subdued text */
  subText?: string;
  /** When true, renders subText in warning/critical tone */
  warning?: boolean;
}) {
  return (
    <BlockStack gap="050">
      <Text as="p" variant="bodySm" tone="subdued">{label}</Text>
      <Text as="p" fontWeight={highlight ? 'semibold' : 'regular'} variant={highlight ? 'bodyMd' : 'bodySm'}>{value}</Text>
      {subText && (
        <Text as="p" variant="bodySm" tone={warning ? 'critical' : 'subdued'}>{subText}</Text>
      )}
    </BlockStack>
  );
}

/** Pricing tiers table — only shown when variants.length > 1 */
function PricingTiersCard({ variants }: { variants: ProductDetailVariant[] }) {
  if (variants.length <= 1) return null;

  const rows = variants.map((v, i) => [
    `Tier ${i + 1}`,
    v.variant_tier === 1 ? 'Single unit' : `Min qty: ${v.variant_tier}`,
    formatPrice(v.merchant_cost),
    formatPrice(v.list_price),
    estMargin(v.merchant_cost, v.list_price),
    v.catalog_quantity != null ? v.catalog_quantity.toLocaleString() : '—',
    v.upc ?? '—',
  ]);

  return (
    <Card>
      <BlockStack gap="300">
        <Text as="h2" variant="headingSm">Pricing tiers</Text>
        <DataTable
          columnContentTypes={['text', 'text', 'numeric', 'numeric', 'numeric', 'numeric', 'text']}
          headings={['Tier', 'Quantity', 'Your cost', 'List price', 'Est. margin', 'Qty', 'UPC']}
          rows={rows}
          hoverable={false}
        />
      </BlockStack>
    </Card>
  );
}

/** Description card — collapses if long */
function DescriptionCard({ description, format }: { description: string | null; format: 'html' | 'text' | null }) {
  const [expanded, setExpanded] = useState(false);
  if (!description) return null;

  const isLong = description.length > 500;
  const displayText = isLong && !expanded ? `${description.slice(0, 500)}…` : description;

  return (
    <Card>
      <BlockStack gap="300">
        <Text as="h2" variant="headingSm">Description</Text>
        {format === 'html' ? (
          // eslint-disable-next-line react/no-danger
          <div dangerouslySetInnerHTML={{ __html: description }} style={{ lineHeight: 1.6 }} />
        ) : (
          <Text as="p" variant="bodyMd">{displayText}</Text>
        )}
        {isLong && (
          <Button variant="plain" onClick={() => setExpanded(e => !e)}>
            {expanded ? 'Show less' : 'Show more'}
          </Button>
        )}
      </BlockStack>
    </Card>
  );
}

/** Physical specs card */
function DimensionsCard({ product }: { product: ProductDetailResponse }) {
  const hasAny = product.weight_lbs != null || product.length_in != null || product.width_in != null || product.height_in != null;
  if (!hasAny) return null;

  const dims = [product.length_in, product.width_in, product.height_in];
  const allDims = dims.every(d => d != null);
  const dimStr = allDims ? `${product.length_in} × ${product.width_in} × ${product.height_in} in` : null;

  return (
    <Card>
      <BlockStack gap="300">
        <Text as="h2" variant="headingSm">Dimensions &amp; weight</Text>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '0.75rem' }}>
          {product.weight_lbs != null && <LabelValue label="Weight" value={`${product.weight_lbs} lb`} />}
          {dimStr && <LabelValue label="Dimensions (L×W×H)" value={dimStr} />}
          {product.country_of_origin && <LabelValue label="Country of origin" value={product.country_of_origin} />}
        </div>
      </BlockStack>
    </Card>
  );
}

/** Shopify integration status card */
function ShopifyStatusCard({ product, shopDomain }: { product: ProductDetailResponse; shopDomain: string | undefined }) {
  const adminUrl = shopifyAdminUrl(shopDomain, product.shopify_product_id);
  const shopifyStatus = product.last_shopify_status?.toUpperCase() ?? null;

  if (!product.in_shopify) return null;

  return (
    <Card>
      <BlockStack gap="300">
        <Text as="h2" variant="headingSm">Shopify status</Text>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem 1.5rem' }}>
          <LabelValue
            label="Product status"
            value={
              shopifyStatus && shopifyStatus !== 'UNKNOWN'
                ? shopifyStatus.charAt(0) + shopifyStatus.slice(1).toLowerCase()
                : 'In Shopify'
            }
          />
          <LabelValue label="Last synced" value={formatDateTime(product.last_synced_at)} />
          <LabelValue label="Last price sync" value={formatDateTime(product.last_price_synced_at)} />
          {product.last_synced_quantity != null && (
            <LabelValue label="Last synced qty" value={product.last_synced_quantity.toLocaleString()} />
          )}
        </div>
        {adminUrl && (
          <Box paddingBlockStart="100">
            <Button
              variant="plain"
              url={adminUrl}
              external
              icon={
                <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true" focusable="false">
                  <path d="M15 10a.75.75 0 0 1-.75-.75V5.56l-7.22 7.22a.75.75 0 1 1-1.06-1.06l7.22-7.22H9.75a.75.75 0 0 1 0-1.5h5c.414 0 .75.336.75.75v5a.75.75 0 0 1-.75.75Z" fill="currentColor"/>
                </svg>
              }
            >
              View in Shopify Admin
            </Button>
          </Box>
        )}
      </BlockStack>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ProductDetailPage() {
  const params = useParams();
  const router = useRouter();
  const sku = Array.isArray(params.sku) ? params.sku[0] : params.sku ?? '';

  const { shop } = useMerchantContext();
  const shopDomain = shop?.domain;

  const { data: product, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['productDetail', sku],
    queryFn: () => getProductDetail(sku),
    staleTime: 60_000,
    enabled: sku.length > 0,
  });

  if (isLoading) return <LoadingSkeleton />;

  if (isError || !product) {
    const is404 = error instanceof ApiError && error.status === 404;
    return (
      <Page
        backAction={{ content: 'Products', onAction: () => router.back() }}
        title="Product not found"
      >
        <Banner
          title={is404 ? 'Product not in your catalog' : 'Could not load product'}
          tone="critical"
          action={is404 ? undefined : { content: 'Retry', onAction: () => void refetch() }}
        >
          <Text as="p">
            {is404
              ? 'This product could not be found in the AOA catalog. It may have been discontinued or the SKU is incorrect.'
              : (error as Error)?.message || 'An unexpected error occurred.'}
          </Text>
        </Banner>
      </Page>
    );
  }

  const adminUrl = shopifyAdminUrl(shopDomain, product.shopify_product_id);

  return (
    <Page
      backAction={{ content: 'Products', onAction: () => router.back() }}
      title={product.product_name ?? product.aoa_sku}
      subtitle={`SKU: ${product.aoa_sku}`}
      primaryAction={adminUrl ? {
        content: 'View in Shopify',
        url: adminUrl,
        external: true,
      } : undefined}
    >
      <BlockStack gap="400">
        {/* Hero: image + core info side by side */}
        <Card>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(200px, 280px) 1fr', gap: '1.5rem', alignItems: 'start' }}>
            <ImageGallery images={product.images} imageUrl={product.image_url} />
            <ProductInfoPanel product={product} />
          </div>
        </Card>

        {/* Pricing tiers (multi-tier products only) */}
        <PricingTiersCard variants={product.variants} />

        {/* Description */}
        <DescriptionCard description={product.description} format={product.description_format} />

        {/* Dimensions */}
        <DimensionsCard product={product} />

        {/* Shopify integration status */}
        <ShopifyStatusCard product={product} shopDomain={shopDomain} />
      </BlockStack>
    </Page>
  );
}
