/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { Component, useContext } from "react";
import { debounce, isEqual } from "lodash";
import { Link, RouteComponentProps } from "react-router-dom";
import queryString from "query-string";
import {
  EuiHorizontalRule,
  EuiBasicTable,
  Criteria,
  EuiTableSortingType,
  Direction,
  Pagination,
  EuiTableSelectionType,
  EuiButton,
  EuiLink,
  EuiTitle,
  EuiFormRow,
  EuiEmptyPrompt,
  EuiText,
} from "@elastic/eui";
import { ContentPanel, ContentPanelActions } from "../../../../components/ContentPanel";
import { DEFAULT_PAGE_SIZE_OPTIONS, DEFAULT_QUERY_PARAMS } from "../../utils/constants";
import CommonService from "../../../../services/CommonService";
import { ITemplate } from "../../interface";
import { BREADCRUMBS, ROUTES } from "../../../../utils/constants";
import { CoreServicesContext } from "../../../../components/core_services";
import { ServicesContext } from "../../../../services";
import IndexControls, { SearchControlsProps } from "../../components/IndexControls";
import TemplatesActions from "../TemplatesActions";
import { CoreStart } from "opensearch-dashboards/public";
import { TemplateItemRemote } from "../../../../../models/interfaces";
import { TemplateConvert } from "../../../CreateIndexTemplate/components/TemplateType";
import AssociatedComponentsModal from "../AssociatedComponentsModal";

interface TemplatesProps extends RouteComponentProps {
  commonService: CommonService;
}

type TemplatesState = {
  totalTemplates: number;
  from: string;
  size: string;
  sortField: keyof ITemplate;
  sortDirection: Direction;
  selectedItems: ITemplate[];
  templates: ITemplate[];
  loading: boolean;
} & SearchControlsProps["value"];

const defaultFilter = {
  search: DEFAULT_QUERY_PARAMS.search,
};

class Templates extends Component<TemplatesProps, TemplatesState> {
  static contextType = CoreServicesContext;
  constructor(props: TemplatesProps) {
    super(props);
    const {
      from = DEFAULT_QUERY_PARAMS.from,
      size = DEFAULT_QUERY_PARAMS.size,
      search = DEFAULT_QUERY_PARAMS.search,
      sortField = DEFAULT_QUERY_PARAMS.sortField,
      sortDirection = DEFAULT_QUERY_PARAMS.sortDirection,
    } = queryString.parse(props.history.location.search) as {
      from: string;
      size: string;
      search: string;
      sortField: keyof ITemplate;
      sortDirection: Direction;
    };
    this.state = {
      ...defaultFilter,
      totalTemplates: 0,
      from,
      size,
      search,
      sortField,
      sortDirection,
      selectedItems: [],
      templates: [],
      loading: false,
    };

    this.getTemplates = debounce(this.getTemplates, 500, { leading: true });
  }

  componentDidMount() {
    this.context.chrome.setBreadcrumbs([BREADCRUMBS.INDEX_MANAGEMENT, BREADCRUMBS.TEMPLATES]);
    this.getTemplates();
  }

  getQueryState = (state: TemplatesState) => {
    return Object.keys(DEFAULT_QUERY_PARAMS).reduce((total, key) => {
      return {
        ...total,
        [key]: state[key as keyof typeof DEFAULT_QUERY_PARAMS],
      };
    }, {} as TemplatesState);
  };

  getTemplates = async (): Promise<void> => {
    this.setState({ loading: true });
    const { from, size } = this.state;
    const fromNumber = Number(from);
    const sizeNumber = Number(size);
    const { history, commonService } = this.props;
    const queryObject = this.getQueryState(this.state);
    const queryParamsString = queryString.stringify(queryObject);
    history.replace({ ...this.props.location, search: queryParamsString });

    const payload: any = {
      format: "json",
      name: `*${queryObject.search}*`,
      s: `${queryObject.sortField}:${queryObject.sortDirection}`,
    };

    let allTemplatesDetail: TemplateItemRemote[] = [];

    const allTemplatesResponse = await commonService.apiCaller<{
      index_templates?: {
        name: string;
        index_template: TemplateItemRemote;
      }[];
    }>({
      endpoint: "transport.request",
      data: {
        method: "GET",
        path: "_index_template/*",
      },
    });

    if (!allTemplatesResponse.ok) {
      allTemplatesDetail = [];
    } else {
      allTemplatesDetail =
        allTemplatesResponse.response.index_templates?.map((item) => ({
          ...item.index_template,
          name: item.name,
        })) || [];
    }

    const getTemplatesResponse = await commonService.apiCaller<ITemplate[]>({
      endpoint: "cat.templates",
      data: payload,
    });

    if (getTemplatesResponse.ok) {
      // enhance the catResponse with template detail
      const response: ITemplate[] = getTemplatesResponse.response
        .filter((item) => item.composed_of)
        .map((item) => ({
          ...item,
          templateDetail: allTemplatesDetail.find((detailItem) => detailItem.name === item.name),
        }));
      const totalTemplates = response.length;
      const payload = {
        templates: response.slice(fromNumber * sizeNumber, (fromNumber + 1) * sizeNumber),
        totalTemplates,
        selectedItems: this.state.selectedItems
          .map((item) => response.find((remoteItem) => remoteItem.name === item.name))
          .filter((item) => item),
      } as TemplatesState;
      this.setState(payload);
    } else {
      this.context.notifications.toasts.addDanger(getTemplatesResponse.error);
    }

    // Avoiding flicker by showing/hiding the "Data stream" column only after the results are loaded.
    this.setState({ loading: false });
  };

  onTableChange = ({ page: tablePage, sort }: Criteria<ITemplate>): void => {
    const { index: page, size } = tablePage || {};
    const { field: sortField, direction: sortDirection } = sort || {};
    this.setState(
      {
        from: "" + page,
        size: "" + size,
        sortField: sortField || DEFAULT_QUERY_PARAMS.sortField,
        sortDirection: sortDirection as Direction,
      },
      () => this.getTemplates()
    );
  };

  onSelectionChange = (selectedItems: ITemplate[]): void => {
    this.setState({ selectedItems });
  };

  onSearchChange = (params: Parameters<SearchControlsProps["onSearchChange"]>[0]): void => {
    this.setState({ from: "0", ...params }, () => this.getTemplates());
  };

  render() {
    const { totalTemplates, from, size, sortField, sortDirection, templates } = this.state;

    const pagination: Pagination = {
      pageIndex: Number(from),
      pageSize: Number(size),
      pageSizeOptions: DEFAULT_PAGE_SIZE_OPTIONS,
      totalItemCount: Number(totalTemplates),
    };

    const sorting: EuiTableSortingType<ITemplate> = {
      sort: {
        direction: sortDirection,
        field: sortField,
      },
    };

    const selection: EuiTableSelectionType<ITemplate> = {
      onSelectionChange: this.onSelectionChange,
    };
    return (
      <ContentPanel
        actions={
          <ContentPanelActions
            actions={[
              {
                text: "",
                children: (
                  <TemplatesActions selectedItems={this.state.selectedItems} onDelete={this.getTemplates} history={this.props.history} />
                ),
              },
              {
                text: "Create template",
                buttonProps: {
                  fill: true,
                  onClick: () => {
                    this.props.history.push(ROUTES.CREATE_TEMPLATE);
                  },
                },
              },
            ]}
          />
        }
        bodyStyles={{ padding: "initial" }}
        title={
          <>
            <EuiTitle>
              <span>Templates</span>
            </EuiTitle>
            <EuiFormRow
              fullWidth
              helpText={
                <div>
                  Index templates let you initialize new indexes or data streams with predefined mappings and settings.{" "}
                  <EuiLink target="_blank" external href={(this.context as CoreStart).docLinks.links.opensearch.indexTemplates.base}>
                    Learn more
                  </EuiLink>
                </div>
              }
            >
              <></>
            </EuiFormRow>
          </>
        }
      >
        <IndexControls
          value={{
            search: this.state.search,
          }}
          onSearchChange={this.onSearchChange}
        />
        <EuiHorizontalRule margin="xs" />

        <EuiBasicTable
          data-test-subj="templatesTable"
          loading={this.state.loading}
          columns={[
            {
              field: "name",
              name: "Template name",
              sortable: true,
              render: (value: string) => {
                return (
                  <Link to={`${ROUTES.CREATE_TEMPLATE}/${value}`}>
                    <EuiLink>{value}</EuiLink>
                  </Link>
                );
              },
            },
            {
              field: "templateType",
              name: "Template type",
              render: (value: string, record) => {
                return TemplateConvert({
                  value: record.templateDetail?.data_stream,
                });
              },
            },
            {
              field: "index_patterns",
              name: "Index patterns",
              sortable: true,
            },
            {
              field: "order",
              name: "Priority",
              sortable: true,
              align: "right",
            },
            {
              field: "composed_of",
              name: "Associated component templates",
              align: "right",
              render: (value: string, record) => {
                return (
                  <AssociatedComponentsModal
                    template={record}
                    onUnlink={() => this.getTemplates()}
                    renderProps={({ setVisible }) => (
                      <EuiLink onClick={() => setVisible(true)}>{record.templateDetail?.composed_of?.length || 0}</EuiLink>
                    )}
                  />
                );
              },
            },
          ]}
          isSelectable={true}
          itemId="name"
          items={templates}
          onChange={this.onTableChange}
          pagination={pagination}
          selection={selection}
          sorting={sorting}
          noItemsMessage={
            isEqual(
              {
                search: this.state.search,
              },
              defaultFilter
            ) ? (
              <EuiEmptyPrompt
                body={
                  <EuiText>
                    <p>You have no templates.</p>
                  </EuiText>
                }
                actions={[
                  <EuiButton
                    fill
                    onClick={() => {
                      this.props.history.push(ROUTES.CREATE_TEMPLATE);
                    }}
                  >
                    Create template
                  </EuiButton>,
                ]}
              />
            ) : (
              <EuiEmptyPrompt
                body={
                  <EuiText>
                    <p>There are no templates matching your applied filters. Reset your filters to view your templates.</p>
                  </EuiText>
                }
                actions={[
                  <EuiButton
                    fill
                    onClick={() => {
                      this.setState(defaultFilter, () => {
                        this.getTemplates();
                      });
                    }}
                  >
                    Reset filters
                  </EuiButton>,
                ]}
              />
            )
          }
        />
      </ContentPanel>
    );
  }
}

export default function TemplatesContainer(props: Omit<TemplatesProps, "commonService">) {
  const context = useContext(ServicesContext);
  return <Templates {...props} commonService={context?.commonService as CommonService} />;
}
